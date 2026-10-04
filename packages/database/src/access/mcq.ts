import { type McqQuestion, type McqSet, validateContent } from "@medos/parsers/model";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";

import type { Database } from "../client";
import {
  type McqAttempt,
  type McqDraft,
  type McqMode,
  type McqSession,
  type SessionQuestion,
  mcqAttempts,
  mcqSessions,
  resources,
} from "../schema";

/*
 * MCQ practice at the trusted boundary. Answers are marked here, on the
 * server, against the imported answer; the browser never decides whether it
 * was right. Every answer in every session is its own attempt. A session or
 * quiz that is not the user's behaves exactly like one that does not exist.
 * Nothing here changes lecture completion.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (value: string) => UUID.test(value);

/** Late saves within this margin of a time limit still count (network delay). */
export const TIME_LIMIT_GRACE_SECONDS = 30;
/** Time recorded for one question is capped, so a forgotten tab cannot inflate it. */
export const MAX_QUESTION_TIME_MS = 60 * 60 * 1000;

export interface McqSetView {
  resourceId: string;
  lectureId: string;
  originalFilename: string;
  set: McqSet;
  /** False when the file changed after these questions were read from it. */
  current: boolean;
}

export interface McqSessionView {
  session: McqSession;
  attempts: McqAttempt[];
}

/** Whether an option is the correct answer; null when the source states no answer. */
export function isCorrect(question: McqQuestion, optionIndex: number): boolean | null {
  return question.answer.status === "resolved" ? question.answer.optionIndex === optionIndex : null;
}

const capTime = (ms: number) =>
  Number.isFinite(ms) ? Math.min(Math.max(Math.round(ms), 0), MAX_QUESTION_TIME_MS) : 0;

/** The moment after which an exam no longer accepts answers, or null when untimed. */
export function sessionDeadline(
  session: Pick<McqSession, "startedAt" | "timeLimitSeconds">,
): Date | null {
  if (session.timeLimitSeconds === null) return null;
  return new Date(
    session.startedAt.getTime() + (session.timeLimitSeconds + TIME_LIMIT_GRACE_SECONDS) * 1000,
  );
}

export type StartInput = {
  mode: McqMode;
  /** Question keys in the order they are asked. */
  keys: string[];
  shuffled: boolean;
  timeLimitSeconds: number | null;
};

export type AnswerResult =
  | { ok: true; attempt: McqAttempt; question: McqQuestion }
  | { ok: false; reason: "not-found" | "invalid" | "closed" };

export type DraftResult =
  | { ok: true; draft: McqDraft }
  | { ok: false; reason: "not-found" | "invalid" | "closed" | "expired" };

export function createMcqAccess(db: Database, userId: string) {
  async function loadSet(resourceId: string): Promise<McqSetView | null> {
    if (!isId(resourceId)) return null;
    const row = await db.query.resources.findFirst({
      where: and(eq(resources.id, resourceId), eq(resources.userId, userId)),
      columns: { id: true, lectureId: true, kind: true, originalFilename: true, contentHash: true },
      with: { content: { columns: { content: true, sourceContentHash: true } } },
    });
    if (!row || row.kind !== "mcq" || !row.content) return null;
    const set = validateContent(row.content.content);
    if (set.format !== "mcq-set") return null;
    return {
      resourceId: row.id,
      lectureId: row.lectureId,
      originalFilename: row.originalFilename,
      set,
      current: row.content.sourceContentHash === row.contentHash,
    };
  }

  async function loadSession(sessionId: string): Promise<McqSessionView | null> {
    if (!isId(sessionId)) return null;
    const [session] = await db
      .select()
      .from(mcqSessions)
      .where(and(eq(mcqSessions.id, sessionId), eq(mcqSessions.userId, userId)));
    if (!session) return null;
    const attempts = await db
      .select()
      .from(mcqAttempts)
      .where(and(eq(mcqAttempts.sessionId, sessionId), eq(mcqAttempts.userId, userId)))
      .orderBy(asc(mcqAttempts.answeredAt));
    return { session, attempts };
  }

  /** How many attempts the user has made at a question before (any session). */
  async function previousAttempts(resourceId: string, fingerprint: string): Promise<number> {
    const [row] = await db
      .select({ n: count() })
      .from(mcqAttempts)
      .where(
        and(
          eq(mcqAttempts.userId, userId),
          eq(mcqAttempts.resourceId, resourceId),
          eq(mcqAttempts.questionFingerprint, fingerprint),
        ),
      );
    return row?.n ?? 0;
  }

  /** The session's set and the question of `key`, if both are the user's. */
  async function sessionQuestion(view: McqSessionView, key: string) {
    const entry = view.session.questions.find((question) => question.key === key);
    if (!entry) return null;
    const set = await loadSet(view.session.resourceId);
    const question = set?.set.questions.find((candidate) => candidate.key === key);
    return question ? { entry, question } : null;
  }

  async function recordAttempt(
    session: McqSession,
    entry: SessionQuestion,
    question: McqQuestion,
    input: { optionIndex: number | null; timeMs: number; flagged: boolean },
    now: Date,
  ): Promise<McqAttempt | null> {
    const attemptNumber = (await previousAttempts(session.resourceId, entry.fingerprint)) + 1;
    const [attempt] = await db
      .insert(mcqAttempts)
      .values({
        userId,
        sessionId: session.id,
        resourceId: session.resourceId,
        mode: session.mode,
        questionKey: entry.key,
        questionFingerprint: entry.fingerprint,
        selectedOption: input.optionIndex,
        correct: input.optionIndex === null ? null : isCorrect(question, input.optionIndex),
        timeSpentMs: capTime(input.timeMs),
        attemptNumber,
        flagged: input.flagged,
        answeredAt: now,
      })
      .onConflictDoNothing()
      .returning();
    return attempt ?? null;
  }

  return {
    get: loadSet,

    sessions: {
      get: loadSession,

      /** The user's sessions on one quiz, newest first. */
      async list(resourceId: string): Promise<McqSession[]> {
        if (!isId(resourceId)) return [];
        return db
          .select()
          .from(mcqSessions)
          .where(and(eq(mcqSessions.resourceId, resourceId), eq(mcqSessions.userId, userId)))
          .orderBy(desc(mcqSessions.startedAt));
      },

      /** Starts a session on questions of the user's quiz, in the order given. */
      async start(
        resourceId: string,
        input: StartInput,
        now = new Date(),
      ): Promise<McqSession | null> {
        const set = await loadSet(resourceId);
        if (!set) return null;
        const byKey = new Map(set.set.questions.map((question) => [question.key, question]));
        if (input.keys.length === 0 || new Set(input.keys).size !== input.keys.length) return null;
        const questions: SessionQuestion[] = [];
        for (const key of input.keys) {
          const question = byKey.get(key);
          if (!question) return null;
          questions.push({ key, fingerprint: question.fingerprint });
        }
        if (input.mode === "learn" && input.timeLimitSeconds !== null) return null;
        if (input.timeLimitSeconds !== null && !(input.timeLimitSeconds > 0)) return null;
        const [session] = await db
          .insert(mcqSessions)
          .values({
            userId,
            resourceId,
            mode: input.mode,
            questions,
            shuffled: input.shuffled,
            timeLimitSeconds: input.timeLimitSeconds,
            startedAt: now,
          })
          .returning();
        return session ?? null;
      },

      /**
       * Learn mode: answers one question and marks it at once. A question is
       * answered once per session; asking again returns the first answer.
       */
      async answer(
        sessionId: string,
        input: { key: string; optionIndex: number; timeMs: number },
        now = new Date(),
      ): Promise<AnswerResult> {
        const view = await loadSession(sessionId);
        if (!view) return { ok: false, reason: "not-found" };
        if (view.session.mode !== "learn" || view.session.status !== "in-progress") {
          return { ok: false, reason: "closed" };
        }
        const found = await sessionQuestion(view, input.key);
        if (!found) return { ok: false, reason: "invalid" };
        const { entry, question } = found;
        if (
          !Number.isInteger(input.optionIndex) ||
          input.optionIndex < 0 ||
          input.optionIndex >= question.options.length
        ) {
          return { ok: false, reason: "invalid" };
        }
        const existing = view.attempts.find((attempt) => attempt.questionKey === input.key);
        if (existing) return { ok: true, attempt: existing, question };
        const attempt =
          (await recordAttempt(view.session, entry, question, { ...input, flagged: false }, now)) ??
          (await loadSession(sessionId))?.attempts.find((row) => row.questionKey === input.key);
        return attempt ? { ok: true, attempt, question } : { ok: false, reason: "invalid" };
      },

      /**
       * Exam and USMLE modes: saves the user's current answer, flag and time
       * for one question, without marking it. Refused once the time limit
       * (with a short grace) has passed.
       */
      async saveDraft(
        sessionId: string,
        input: { key: string; optionIndex: number | null; flagged: boolean; timeMs: number },
        now = new Date(),
      ): Promise<DraftResult> {
        const view = await loadSession(sessionId);
        if (!view) return { ok: false, reason: "not-found" };
        const { session } = view;
        if (session.mode === "learn" || session.status !== "in-progress") {
          return { ok: false, reason: "closed" };
        }
        const deadline = sessionDeadline(session);
        if (deadline && now > deadline) return { ok: false, reason: "expired" };
        const found = await sessionQuestion(view, input.key);
        if (!found) return { ok: false, reason: "invalid" };
        if (
          input.optionIndex !== null &&
          (!Number.isInteger(input.optionIndex) ||
            input.optionIndex < 0 ||
            input.optionIndex >= found.question.options.length)
        ) {
          return { ok: false, reason: "invalid" };
        }
        // One statement that changes only this question's entries, so saves
        // arriving together (an answer, then a flag) never overwrite each other.
        const key = input.key;
        const answers =
          input.optionIndex === null
            ? sql`(${mcqSessions.draft}->'answers') - ${key}::text`
            : sql`jsonb_set(${mcqSessions.draft}->'answers', array[${key}::text], to_jsonb(${input.optionIndex}::int))`;
        const flagged = sql`coalesce((select jsonb_agg(flag) from jsonb_array_elements(${mcqSessions.draft}->'flagged') as flag where flag <> to_jsonb(${key}::text)), '[]'::jsonb)${
          input.flagged ? sql` || jsonb_build_array(${key}::text)` : sql``
        }`;
        const time = sql`jsonb_set(${mcqSessions.draft}->'timeMs', array[${key}::text], to_jsonb(${capTime(input.timeMs)}::int))`;
        const [updated] = await db
          .update(mcqSessions)
          .set({
            draft: sql`jsonb_build_object('answers', ${answers}, 'flagged', ${flagged}, 'timeMs', ${time})`,
          })
          .where(
            and(
              eq(mcqSessions.id, sessionId),
              eq(mcqSessions.userId, userId),
              eq(mcqSessions.status, "in-progress"),
            ),
          )
          .returning({ draft: mcqSessions.draft });
        return updated ? { ok: true, draft: updated.draft } : { ok: false, reason: "closed" };
      },

      /**
       * Ends a session. For an exam, every question becomes an attempt (with
       * no option when it was left unanswered), marked against the source.
       * Submitting again changes nothing.
       */
      async submit(sessionId: string, now = new Date()): Promise<McqSessionView | null> {
        const view = await loadSession(sessionId);
        if (!view) return null;
        const { session } = view;
        if (session.status !== "in-progress") return view;

        if (session.mode !== "learn") {
          const set = await loadSet(session.resourceId);
          if (!set) return null;
          const byKey = new Map(set.set.questions.map((question) => [question.key, question]));
          for (const entry of session.questions) {
            const question = byKey.get(entry.key);
            if (!question || view.attempts.some((attempt) => attempt.questionKey === entry.key)) {
              continue;
            }
            const chosen = session.draft.answers[entry.key];
            await recordAttempt(
              session,
              entry,
              question,
              {
                optionIndex: chosen ?? null,
                timeMs: session.draft.timeMs[entry.key] ?? 0,
                flagged: session.draft.flagged.includes(entry.key),
              },
              now,
            );
          }
        }

        const elapsed = Math.max(
          0,
          Math.round((now.getTime() - session.startedAt.getTime()) / 1000),
        );
        await db
          .update(mcqSessions)
          .set({
            status: "submitted",
            submittedAt: now,
            elapsedSeconds:
              session.timeLimitSeconds === null
                ? elapsed
                : Math.min(elapsed, session.timeLimitSeconds),
          })
          .where(
            and(
              eq(mcqSessions.id, sessionId),
              eq(mcqSessions.userId, userId),
              eq(mcqSessions.status, "in-progress"),
            ),
          );
        return loadSession(sessionId);
      },

      /** Abandons an unfinished exam. It is kept, and never counts in results. */
      async discard(sessionId: string): Promise<boolean> {
        if (!isId(sessionId)) return false;
        const updated = await db
          .update(mcqSessions)
          .set({ status: "discarded" })
          .where(
            and(
              eq(mcqSessions.id, sessionId),
              eq(mcqSessions.userId, userId),
              eq(mcqSessions.status, "in-progress"),
              inArray(mcqSessions.mode, ["exam", "usmle"]),
            ),
          )
          .returning({ id: mcqSessions.id });
        return updated.length > 0;
      },
    },

    /**
     * For the lecture page: the score of the latest submitted exam or USMLE
     * session on each of a lecture's quizzes. Information only.
     */
    async latestScores(lectureId: string): Promise<Map<string, number>> {
      if (!isId(lectureId)) return new Map();
      const quizzes = await db
        .select({ id: resources.id })
        .from(resources)
        .where(
          and(
            eq(resources.lectureId, lectureId),
            eq(resources.userId, userId),
            eq(resources.kind, "mcq"),
          ),
        );
      const scores = new Map<string, number>();
      for (const quiz of quizzes) {
        const [latest] = await db
          .select({ id: mcqSessions.id })
          .from(mcqSessions)
          .where(
            and(
              eq(mcqSessions.resourceId, quiz.id),
              eq(mcqSessions.userId, userId),
              eq(mcqSessions.status, "submitted"),
              inArray(mcqSessions.mode, ["exam", "usmle"]),
            ),
          )
          .orderBy(desc(mcqSessions.submittedAt))
          .limit(1);
        if (!latest) continue;
        const attempts = await db
          .select({ correct: mcqAttempts.correct })
          .from(mcqAttempts)
          .where(and(eq(mcqAttempts.sessionId, latest.id), eq(mcqAttempts.userId, userId)));
        const scored = attempts.length;
        if (scored === 0) continue;
        const right = attempts.filter((attempt) => attempt.correct === true).length;
        scores.set(quiz.id, Math.round((right / scored) * 100));
      }
      return scores;
    },
  };
}
