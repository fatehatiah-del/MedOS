import { STUDY_TIMER } from "@medos/shared";
import { and, count, desc, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";

import type { Database } from "../client";
import {
  STUDY_ACTIVITIES,
  type StudyActivity,
  type StudyPauseReason,
  type StudySession,
  courses,
  lectures,
  studySessions,
} from "../schema";

/*
 * The study timer at the trusted boundary. The server keeps the time: the
 * browser only says start, pause, resume, finish and "still here". Paused time
 * is never counted, and a running stretch whose browser went away (no
 * heartbeat for a while) counts only up to the last moment the user was seen,
 * never silently up to now. A user has at most one open session; the database
 * enforces it. A session that is not the user's behaves exactly like one that
 * does not exist. Nothing here changes lecture completion.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (value: string) => UUID.test(value);

export type StudySessionState = "running" | "paused" | "interrupted" | "finished";

export interface StudySessionView {
  id: string;
  activity: StudyActivity;
  state: StudySessionState;
  /** Why the session is paused; null unless it is paused. */
  pausedReason: StudyPauseReason | null;
  course: {
    id: string;
    slug: string;
    name: string;
    shortName: string;
    colorToken: string | null;
  } | null;
  lecture: { id: string; number: number; title: string } | null;
  startedAt: Date;
  endedAt: Date | null;
  /** Active time as of `asOf`. Only grows afterwards while `state` is "running". */
  activeSeconds: number;
  asOf: Date;
  /** The last moment the user was seen studying. */
  lastActiveAt: Date;
}

export interface StartTimerInput {
  activity: StudyActivity;
  courseId?: string | null;
  lectureId?: string | null;
  /** Finish the open session, if any, and start this one in its place. */
  replaceOpen?: boolean;
}

export type StartTimerResult =
  | { ok: true; session: StudySessionView }
  | { ok: false; reason: "not-found" | "invalid" }
  | { ok: false; reason: "already-open"; open: StudySessionView };

export interface StudyTimeFilter {
  courseId?: string;
  lectureId?: string;
  /** Sessions that started at or after this instant. */
  from?: Date;
  /** Sessions that started before this instant. */
  to?: Date;
}

export interface StudyTimeSummary {
  totalSeconds: number;
  sessionCount: number;
  byActivity: Partial<Record<StudyActivity, number>>;
}

type TimingRow = Pick<StudySession, "activeSeconds" | "runningSince" | "lastActiveAt">;

const later = (a: Date, b: Date) => (a > b ? a : b);
const earlier = (a: Date, b: Date) => (a < b ? a : b);
const seconds = (from: Date, to: Date) =>
  Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));

/** A running timer whose browser has not reported for longer than the stale limit. */
export function isInterrupted(row: TimingRow, now: Date): boolean {
  return (
    row.runningSince !== null &&
    now.getTime() - row.lastActiveAt.getTime() > STUDY_TIMER.staleSeconds * 1000
  );
}

/**
 * Where the running stretch ends if it is closed now, or at `at` (an earlier
 * moment such as the start of an idle period). An interrupted stretch ends no
 * later than the last moment the user was seen. Never before the stretch began.
 */
export function stretchEnd(row: TimingRow, now: Date, at?: Date): Date {
  if (row.runningSince === null) throw new Error("The timer is not running.");
  let end = at ? earlier(at, now) : now;
  if (isInterrupted(row, now)) end = earlier(end, row.lastActiveAt);
  return later(end, row.runningSince);
}

/** Active seconds as of `now`, including the running stretch. */
export function activeSecondsAt(row: TimingRow, now: Date): number {
  if (row.runningSince === null) return row.activeSeconds;
  return row.activeSeconds + seconds(row.runningSince, stretchEnd(row, now));
}

function stateOf(row: TimingRow & Pick<StudySession, "endedAt">, now: Date): StudySessionState {
  if (row.endedAt !== null) return "finished";
  if (row.runningSince === null) return "paused";
  return isInterrupted(row, now) ? "interrupted" : "running";
}

/** Whether the database refused a second open session. */
function isOpenSessionConflict(error: unknown): boolean {
  for (let current: unknown = error; current instanceof Error; current = current.cause) {
    if (current.message.includes("study_sessions_one_open_idx")) return true;
    if ("constraint" in current && current.constraint === "study_sessions_one_open_idx") {
      return true;
    }
  }
  return false;
}

/** The database, or a transaction on it. */
type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

export function createStudySessionAccess(db: Database, userId: string) {
  async function view(
    executor: Executor,
    sessionId: string,
    now: Date,
  ): Promise<StudySessionView | null> {
    const row = await executor.query.studySessions.findFirst({
      where: and(eq(studySessions.id, sessionId), eq(studySessions.userId, userId)),
      with: {
        course: {
          columns: { id: true, slug: true, name: true, shortName: true, colorToken: true },
        },
        lecture: { columns: { id: true, number: true, title: true } },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      activity: row.activity,
      state: stateOf(row, now),
      pausedReason: row.pausedReason,
      course: row.course ?? null,
      lecture: row.lecture ?? null,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      activeSeconds: activeSecondsAt(row, now),
      asOf: now,
      lastActiveAt: row.lastActiveAt,
    };
  }

  async function openId(executor: Executor): Promise<string | null> {
    const [row] = await executor
      .select({ id: studySessions.id })
      .from(studySessions)
      .where(and(eq(studySessions.userId, userId), isNull(studySessions.endedAt)));
    return row?.id ?? null;
  }

  /** The open session, locked for the rest of the transaction; null if it is not open. */
  async function lockOpen(executor: Executor, sessionId: string): Promise<StudySession | null> {
    const [row] = await executor
      .select()
      .from(studySessions)
      .where(
        and(
          eq(studySessions.id, sessionId),
          eq(studySessions.userId, userId),
          isNull(studySessions.endedAt),
        ),
      )
      .for("update");
    return row ?? null;
  }

  /** Closes a locked open session: the running stretch is counted up to its end. */
  async function finishLocked(executor: Executor, row: StudySession, now: Date): Promise<void> {
    const end = row.runningSince === null ? row.lastActiveAt : stretchEnd(row, now);
    await executor
      .update(studySessions)
      .set({
        activeSeconds: activeSecondsAt(row, now),
        runningSince: null,
        pausedReason: null,
        lastActiveAt: end,
        endedAt: later(end, row.startedAt),
      })
      .where(and(eq(studySessions.id, row.id), eq(studySessions.userId, userId)));
  }

  /**
   * Runs `change` on the session if it is open, inside a transaction holding
   * its row, and returns the session as it is afterwards. Null when the
   * session is not the user's; unchanged when it is already finished.
   */
  async function onOpen(
    sessionId: string,
    now: Date,
    change: (executor: Executor, row: StudySession) => Promise<void>,
  ): Promise<StudySessionView | null> {
    if (!isId(sessionId)) return null;
    return db.transaction(async (tx) => {
      const row = await lockOpen(tx, sessionId);
      if (row) await change(tx, row);
      return view(tx, sessionId, now);
    });
  }

  return {
    /** The user's open session (running, paused or interrupted), or null. */
    async current(now = new Date()): Promise<StudySessionView | null> {
      const id = await openId(db);
      return id ? view(db, id, now) : null;
    },

    get(sessionId: string, now = new Date()): Promise<StudySessionView | null> {
      return isId(sessionId) ? view(db, sessionId, now) : Promise.resolve(null);
    },

    /**
     * Starts a running timer. A lecture fixes the course; a course on its own
     * is allowed, and so is neither ("other" study). While another session is
     * open the start is refused with that session, unless `replaceOpen` asks
     * for it to be finished first.
     */
    async start(input: StartTimerInput, now = new Date()): Promise<StartTimerResult> {
      if (!STUDY_ACTIVITIES.includes(input.activity)) return { ok: false, reason: "invalid" };

      let courseId = input.courseId ?? null;
      const lectureId = input.lectureId ?? null;
      if (lectureId !== null) {
        if (!isId(lectureId)) return { ok: false, reason: "not-found" };
        const [lecture] = await db
          .select({ courseId: lectures.courseId })
          .from(lectures)
          .where(and(eq(lectures.id, lectureId), eq(lectures.userId, userId)));
        if (!lecture) return { ok: false, reason: "not-found" };
        if (courseId !== null && courseId !== lecture.courseId) {
          return { ok: false, reason: "invalid" };
        }
        courseId = lecture.courseId;
      } else if (courseId !== null) {
        if (!isId(courseId)) return { ok: false, reason: "not-found" };
        const [course] = await db
          .select({ id: courses.id })
          .from(courses)
          .where(and(eq(courses.id, courseId), eq(courses.userId, userId)));
        if (!course) return { ok: false, reason: "not-found" };
      }

      try {
        const created = await db.transaction(async (tx) => {
          const open = await openId(tx);
          if (open !== null) {
            if (!input.replaceOpen) return { conflict: true, id: open };
            const row = await lockOpen(tx, open);
            if (row) await finishLocked(tx, row, now);
          }
          const [row] = await tx
            .insert(studySessions)
            .values({
              userId,
              courseId,
              lectureId,
              activity: input.activity,
              startedAt: now,
              runningSince: now,
              lastActiveAt: now,
            })
            .returning({ id: studySessions.id });
          if (!row) throw new Error("The study session was not created.");
          return { conflict: false, id: row.id };
        });
        if (created.conflict) {
          const open = await view(db, created.id, now);
          return open
            ? { ok: false, reason: "already-open", open }
            : { ok: false, reason: "invalid" };
        }
        const session = await view(db, created.id, now);
        return session ? { ok: true, session } : { ok: false, reason: "invalid" };
      } catch (error) {
        // Another tab started a timer at the same moment.
        if (!isOpenSessionConflict(error)) throw error;
        const id = await openId(db);
        const open = id ? await view(db, id, now) : null;
        return open
          ? { ok: false, reason: "already-open", open }
          : { ok: false, reason: "invalid" };
      }
    },

    /**
     * Pauses a running timer. `at` backdates the pause, for instance to the
     * start of an idle period, so that idle time is not counted; it can never
     * move the pause before the stretch began or past now. Pausing a paused
     * session changes nothing.
     */
    pause(
      sessionId: string,
      input: { reason: StudyPauseReason; at?: Date },
      now = new Date(),
    ): Promise<StudySessionView | null> {
      return onOpen(sessionId, now, async (tx, row) => {
        if (row.runningSince === null) return;
        const end = stretchEnd(row, now, input.at);
        await tx
          .update(studySessions)
          .set({
            activeSeconds: row.activeSeconds + seconds(row.runningSince, end),
            runningSince: null,
            pausedReason: input.reason,
            lastActiveAt: end,
          })
          .where(and(eq(studySessions.id, row.id), eq(studySessions.userId, userId)));
      });
    },

    /**
     * Resumes a paused timer. For an interrupted one, the stretch before the
     * interruption is kept up to the last moment the user was seen and a new
     * stretch begins now. A running timer is left as it is.
     */
    resume(sessionId: string, now = new Date()): Promise<StudySessionView | null> {
      return onOpen(sessionId, now, async (tx, row) => {
        if (row.runningSince !== null && !isInterrupted(row, now)) return;
        await tx
          .update(studySessions)
          .set({
            activeSeconds: activeSecondsAt(row, now),
            runningSince: later(now, row.startedAt),
            pausedReason: null,
            lastActiveAt: now,
          })
          .where(and(eq(studySessions.id, row.id), eq(studySessions.userId, userId)));
      });
    },

    /**
     * Records that the user is still studying. Only a running timer is kept
     * alive: an interrupted one stays interrupted until the user decides what
     * to do with it, so time is never silently added.
     */
    heartbeat(sessionId: string, now = new Date()): Promise<StudySessionView | null> {
      return onOpen(sessionId, now, async (tx, row) => {
        if (row.runningSince === null || isInterrupted(row, now)) return;
        await tx
          .update(studySessions)
          .set({ lastActiveAt: later(now, row.lastActiveAt) })
          .where(and(eq(studySessions.id, row.id), eq(studySessions.userId, userId)));
      });
    },

    /**
     * Finishes the session. A running stretch counts up to now, or for an
     * interrupted one up to the last moment the user was seen; a paused
     * session ends when it was paused. Finishing twice changes nothing.
     */
    finish(sessionId: string, now = new Date()): Promise<StudySessionView | null> {
      return onOpen(sessionId, now, (tx, row) => finishLocked(tx, row, now));
    },

    /** Deletes a session: discards an open timer, or removes a finished one. */
    async delete(sessionId: string): Promise<boolean> {
      if (!isId(sessionId)) return false;
      const deleted = await db
        .delete(studySessions)
        .where(and(eq(studySessions.id, sessionId), eq(studySessions.userId, userId)))
        .returning({ id: studySessions.id });
      return deleted.length > 0;
    },

    /** Finished sessions, newest first. */
    async recent(
      filter: Pick<StudyTimeFilter, "courseId" | "lectureId"> & { limit?: number } = {},
      now = new Date(),
    ): Promise<StudySessionView[]> {
      const conditions = [eq(studySessions.userId, userId), isNotNull(studySessions.endedAt)];
      if (filter.courseId !== undefined) {
        if (!isId(filter.courseId)) return [];
        conditions.push(eq(studySessions.courseId, filter.courseId));
      }
      if (filter.lectureId !== undefined) {
        if (!isId(filter.lectureId)) return [];
        conditions.push(eq(studySessions.lectureId, filter.lectureId));
      }
      const limit = Math.min(Math.max(Math.trunc(filter.limit ?? 20), 1), 100);
      const rows = await db
        .select({ id: studySessions.id })
        .from(studySessions)
        .where(and(...conditions))
        .orderBy(desc(studySessions.endedAt), desc(studySessions.startedAt))
        .limit(limit);
      const views: StudySessionView[] = [];
      for (const row of rows) {
        const found = await view(db, row.id, now);
        if (found) views.push(found);
      }
      return views;
    },

    /**
     * Active study time, in total and by activity, for sessions matching the
     * filter. A session belongs to the period in which it started. The open
     * session counts with its time so far.
     */
    async summary(filter: StudyTimeFilter = {}, now = new Date()): Promise<StudyTimeSummary> {
      const empty: StudyTimeSummary = { totalSeconds: 0, sessionCount: 0, byActivity: {} };
      const conditions = [eq(studySessions.userId, userId)];
      if (filter.courseId !== undefined) {
        if (!isId(filter.courseId)) return empty;
        conditions.push(eq(studySessions.courseId, filter.courseId));
      }
      if (filter.lectureId !== undefined) {
        if (!isId(filter.lectureId)) return empty;
        conditions.push(eq(studySessions.lectureId, filter.lectureId));
      }
      if (filter.from) conditions.push(gte(studySessions.startedAt, filter.from));
      if (filter.to) conditions.push(lt(studySessions.startedAt, filter.to));

      const closed = await db
        .select({
          activity: studySessions.activity,
          seconds: sql<number>`coalesce(sum(${studySessions.activeSeconds}), 0)::int`,
          sessions: count(),
        })
        .from(studySessions)
        .where(and(...conditions))
        .groupBy(studySessions.activity);

      // The running stretch of the open session is not in `active_seconds` yet.
      const [running] = await db
        .select()
        .from(studySessions)
        .where(
          and(...conditions, isNull(studySessions.endedAt), isNotNull(studySessions.runningSince)),
        );

      const summary: StudyTimeSummary = { totalSeconds: 0, sessionCount: 0, byActivity: {} };
      const add = (activity: StudyActivity, value: number) => {
        summary.totalSeconds += value;
        summary.byActivity[activity] = (summary.byActivity[activity] ?? 0) + value;
      };
      for (const row of closed) {
        summary.sessionCount += row.sessions;
        add(row.activity, row.seconds);
      }
      if (running) add(running.activity, activeSecondsAt(running, now) - running.activeSeconds);
      return summary;
    },
  };
}
