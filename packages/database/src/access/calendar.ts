import { and, asc, eq, gt, gte, isNotNull, lt } from "drizzle-orm";

import type { Database } from "../client";
import { MAX_EVENT_LOCATION, MAX_EVENT_NOTES, MAX_EVENT_TITLE } from "../limits";
import {
  type CalendarEvent,
  type CalendarEventType,
  type ExamKind,
  type StudyActivity,
  EXAM_KINDS,
  calendarEvents,
  courses,
  examEvents,
  lectures,
  studySessions,
} from "../schema";

/*
 * The calendar at the trusted boundary. University events imported from the
 * timetable and academic calendar (those with a source key) are read-only:
 * the user can only keep notes on them. Everything the user creates, their
 * own events and the course exams they enter, can be edited and deleted.
 * An event that is not the user's behaves exactly like one that does not exist.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (value: string) => UUID.test(value);

/** Types of event the user creates themselves. */
export const USER_EVENT_TYPES = ["study-session", "revision", "assignment", "personal"] as const;
export type UserEventType = (typeof USER_EVENT_TYPES)[number];

const MAX_EVENT_MS = 366 * 24 * 60 * 60 * 1000;

export interface CalendarItem {
  id: string;
  type: CalendarEventType;
  origin: CalendarEvent["origin"];
  title: string;
  startsAt: Date;
  /** Exclusive. An all-day event ends at midnight after its last day. */
  endsAt: Date;
  allDay: boolean;
  timezone: string;
  location: string | null;
  notes: string | null;
  studentGroup: string | null;
  course: {
    id: string;
    slug: string;
    name: string;
    shortName: string;
    colorToken: string | null;
  } | null;
  /** Set when the event is a course exam the user entered. */
  exam: { kind: ExamKind } | null;
  /** Imported from the university calendar: only its notes can change. */
  imported: boolean;
}

/** A finished timed study session, as shown on the calendar. */
export interface StudiedItem {
  id: string;
  activity: StudyActivity;
  startedAt: Date;
  endedAt: Date;
  activeSeconds: number;
  course: { slug: string; shortName: string; colorToken: string | null } | null;
  lecture: { id: string; title: string } | null;
}

export interface EventInput {
  type: UserEventType;
  title: string;
  courseId?: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  timezone: string;
  location?: string | null;
  notes?: string | null;
}

export interface ExamInput {
  courseId: string;
  kind: ExamKind;
  /** Defaults to "<course name> — <kind>". */
  title?: string | null;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  location?: string | null;
  notes?: string | null;
}

export type CalendarResult =
  { ok: true; event: CalendarItem } | { ok: false; reason: "not-found" | "invalid" | "read-only" };

const EXAM_LABELS: Record<ExamKind, string> = {
  midterm: "Midterm exam",
  final: "Final exam",
  other: "Exam",
};

const optional = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/** Whether the shared fields of an event are acceptable, after trimming. */
function validTiming(startsAt: Date, endsAt: Date): boolean {
  const start = startsAt.getTime();
  const end = endsAt.getTime();
  return (
    Number.isFinite(start) && Number.isFinite(end) && end >= start && end - start <= MAX_EVENT_MS
  );
}

function validText(location: string | null, notes: string | null): boolean {
  return (
    (location === null || location.length <= MAX_EVENT_LOCATION) &&
    (notes === null || notes.length <= MAX_EVENT_NOTES)
  );
}

type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

export function createCalendarAccess(db: Database, userId: string) {
  async function load(executor: Executor, eventId: string): Promise<CalendarItem | null> {
    const row = await executor.query.calendarEvents.findFirst({
      where: and(eq(calendarEvents.id, eventId), eq(calendarEvents.userId, userId)),
      with: {
        course: {
          columns: { id: true, slug: true, name: true, shortName: true, colorToken: true },
        },
        exam: { columns: { kind: true } },
      },
    });
    return row ? toItem(row) : null;
  }

  function toItem(
    row: CalendarEvent & {
      course: CalendarItem["course"] | null;
      exam: { kind: ExamKind } | null;
    },
  ): CalendarItem {
    return {
      id: row.id,
      type: row.type,
      origin: row.origin,
      title: row.title,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      allDay: row.allDay,
      timezone: row.timezone,
      location: row.location,
      notes: row.notes,
      studentGroup: row.studentGroup,
      course: row.course ?? null,
      exam: row.exam ?? null,
      imported: row.sourceKey !== null,
    };
  }

  async function ownCourse(courseId: string): Promise<{ id: string; name: string } | null> {
    if (!isId(courseId)) return null;
    const [course] = await db
      .select({ id: courses.id, name: courses.name })
      .from(courses)
      .where(and(eq(courses.id, courseId), eq(courses.userId, userId)));
    return course ?? null;
  }

  /** The row of an event the user may edit, or why not. */
  async function editable(
    eventId: string,
  ): Promise<{ row: CalendarEvent; isExam: boolean } | "not-found" | "read-only"> {
    if (!isId(eventId)) return "not-found";
    const row = await db.query.calendarEvents.findFirst({
      where: and(eq(calendarEvents.id, eventId), eq(calendarEvents.userId, userId)),
      with: { exam: { columns: { id: true } } },
    });
    if (!row) return "not-found";
    if (row.sourceKey !== null) return "read-only";
    const { exam, ...event } = row;
    return { row: event, isExam: exam !== null && exam !== undefined };
  }

  /** Checks and normalises an event's own fields; null when they are not acceptable. */
  async function eventFields(input: EventInput) {
    const title = input.title.trim();
    const location = optional(input.location);
    const notes = optional(input.notes);
    if (!(USER_EVENT_TYPES as readonly string[]).includes(input.type)) return null;
    if (title.length === 0 || title.length > MAX_EVENT_TITLE) return null;
    if (!validTiming(input.startsAt, input.endsAt) || !validText(location, notes)) return null;
    let courseId: string | null = null;
    if (input.courseId) {
      const course = await ownCourse(input.courseId);
      if (!course) return null;
      courseId = course.id;
    }
    return {
      type: input.type,
      title,
      courseId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      allDay: input.allDay,
      timezone: input.timezone,
      location,
      notes,
    };
  }

  async function examFields(input: ExamInput) {
    if (!EXAM_KINDS.includes(input.kind)) return null;
    const course = await ownCourse(input.courseId);
    if (!course) return null;
    const title = optional(input.title) ?? `${course.name} — ${EXAM_LABELS[input.kind]}`;
    const location = optional(input.location);
    const notes = optional(input.notes);
    if (title.length > MAX_EVENT_TITLE) return null;
    if (!validTiming(input.startsAt, input.endsAt) || !validText(location, notes)) return null;
    return {
      type: (input.kind === "midterm" ? "midterm" : "exam") as CalendarEventType,
      title,
      courseId: course.id,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      allDay: false,
      timezone: input.timezone,
      location,
      notes,
    };
  }

  return {
    /** Events overlapping [from, to), all-day ones first, then by start. */
    async between(from: Date, to: Date): Promise<CalendarItem[]> {
      const rows = await db.query.calendarEvents.findMany({
        where: and(
          eq(calendarEvents.userId, userId),
          lt(calendarEvents.startsAt, to),
          gt(calendarEvents.endsAt, from),
        ),
        with: {
          course: {
            columns: { id: true, slug: true, name: true, shortName: true, colorToken: true },
          },
          exam: { columns: { kind: true } },
        },
        orderBy: [asc(calendarEvents.startsAt), asc(calendarEvents.endsAt)],
      });
      return rows
        .map(toItem)
        .sort((a, b) => Number(b.allDay) - Number(a.allDay) || +a.startsAt - +b.startsAt);
    },

    /** Finished timed study overlapping [from, to), for showing beside events. */
    async studiedBetween(from: Date, to: Date): Promise<StudiedItem[]> {
      const rows = await db
        .select({
          id: studySessions.id,
          activity: studySessions.activity,
          startedAt: studySessions.startedAt,
          endedAt: studySessions.endedAt,
          activeSeconds: studySessions.activeSeconds,
          courseSlug: courses.slug,
          courseShortName: courses.shortName,
          courseColor: courses.colorToken,
          lectureId: lectures.id,
          lectureTitle: lectures.title,
        })
        .from(studySessions)
        .leftJoin(courses, and(eq(courses.id, studySessions.courseId), eq(courses.userId, userId)))
        .leftJoin(
          lectures,
          and(eq(lectures.id, studySessions.lectureId), eq(lectures.userId, userId)),
        )
        .where(
          and(
            eq(studySessions.userId, userId),
            isNotNull(studySessions.endedAt),
            lt(studySessions.startedAt, to),
            gte(studySessions.endedAt, from),
          ),
        )
        .orderBy(asc(studySessions.startedAt));
      return rows.flatMap((row) =>
        row.endedAt
          ? [
              {
                id: row.id,
                activity: row.activity,
                startedAt: row.startedAt,
                endedAt: row.endedAt,
                activeSeconds: row.activeSeconds,
                course: row.courseSlug
                  ? {
                      slug: row.courseSlug,
                      shortName: row.courseShortName ?? row.courseSlug,
                      colorToken: row.courseColor,
                    }
                  : null,
                lecture:
                  row.lectureId && row.lectureTitle
                    ? { id: row.lectureId, title: row.lectureTitle }
                    : null,
              },
            ]
          : [],
      );
    },

    get(eventId: string): Promise<CalendarItem | null> {
      return isId(eventId) ? load(db, eventId) : Promise.resolve(null);
    },

    /** Creates one of the user's own events. */
    async create(input: EventInput): Promise<CalendarResult> {
      const fields = await eventFields(input);
      if (!fields) return { ok: false, reason: "invalid" };
      const [row] = await db
        .insert(calendarEvents)
        .values({ ...fields, userId, origin: "personal" })
        .returning({ id: calendarEvents.id });
      const event = row ? await load(db, row.id) : null;
      return event ? { ok: true, event } : { ok: false, reason: "invalid" };
    },

    /** Changes one of the user's own events. Imported events and exams are refused. */
    async update(eventId: string, input: EventInput): Promise<CalendarResult> {
      const target = await editable(eventId);
      if (target === "not-found" || target === "read-only") return { ok: false, reason: target };
      if (target.isExam) return { ok: false, reason: "invalid" };
      const fields = await eventFields(input);
      if (!fields) return { ok: false, reason: "invalid" };
      await db
        .update(calendarEvents)
        .set(fields)
        .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.userId, userId)));
      const event = await load(db, eventId);
      return event ? { ok: true, event } : { ok: false, reason: "not-found" };
    },

    /** The user's own notes, on any of their events, imported ones included. */
    async setNotes(eventId: string, notes: string | null): Promise<CalendarResult> {
      if (!isId(eventId)) return { ok: false, reason: "not-found" };
      const value = optional(notes);
      if (!validText(null, value)) return { ok: false, reason: "invalid" };
      const [row] = await db
        .update(calendarEvents)
        .set({ notes: value })
        .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.userId, userId)))
        .returning({ id: calendarEvents.id });
      const event = row ? await load(db, row.id) : null;
      return event ? { ok: true, event } : { ok: false, reason: "not-found" };
    },

    /** Deletes an event the user created, exams included. Imported events are refused. */
    async remove(
      eventId: string,
    ): Promise<{ ok: true } | { ok: false; reason: "not-found" | "read-only" }> {
      const target = await editable(eventId);
      if (target === "not-found" || target === "read-only") return { ok: false, reason: target };
      await db.transaction(async (tx) => {
        await tx
          .delete(examEvents)
          .where(and(eq(examEvents.calendarEventId, eventId), eq(examEvents.userId, userId)));
        await tx
          .delete(calendarEvents)
          .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.userId, userId)));
      });
      return { ok: true };
    },

    exams: {
      /** Adds a course exam, entered by hand once the university announces it. */
      async add(input: ExamInput): Promise<CalendarResult> {
        const fields = await examFields(input);
        if (!fields) return { ok: false, reason: "invalid" };
        const id = await db.transaction(async (tx) => {
          const [row] = await tx
            .insert(calendarEvents)
            .values({ ...fields, userId, origin: "university" })
            .returning({ id: calendarEvents.id });
          if (!row) throw new Error("The exam was not created.");
          await tx.insert(examEvents).values({
            userId,
            calendarEventId: row.id,
            courseId: fields.courseId,
            kind: input.kind,
          });
          return row.id;
        });
        const event = await load(db, id);
        return event ? { ok: true, event } : { ok: false, reason: "invalid" };
      },

      /** Changes an exam the user entered: its course, kind, time, place or notes. */
      async update(eventId: string, input: ExamInput): Promise<CalendarResult> {
        const target = await editable(eventId);
        if (target === "not-found" || target === "read-only") return { ok: false, reason: target };
        if (!target.isExam) return { ok: false, reason: "invalid" };
        const fields = await examFields(input);
        if (!fields) return { ok: false, reason: "invalid" };
        await db.transaction(async (tx) => {
          // The exam row's course must always equal the event's, so it is replaced around the change.
          await tx
            .delete(examEvents)
            .where(and(eq(examEvents.calendarEventId, eventId), eq(examEvents.userId, userId)));
          await tx
            .update(calendarEvents)
            .set(fields)
            .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.userId, userId)));
          await tx.insert(examEvents).values({
            userId,
            calendarEventId: eventId,
            courseId: fields.courseId,
            kind: input.kind,
          });
        });
        const event = await load(db, eventId);
        return event ? { ok: true, event } : { ok: false, reason: "not-found" };
      },

      /** The user's course exams from `from` on, soonest first. */
      async upcoming(from: Date): Promise<CalendarItem[]> {
        const rows = await db.query.calendarEvents.findMany({
          where: and(eq(calendarEvents.userId, userId), gte(calendarEvents.endsAt, from)),
          with: {
            course: {
              columns: { id: true, slug: true, name: true, shortName: true, colorToken: true },
            },
            exam: { columns: { kind: true } },
          },
          orderBy: asc(calendarEvents.startsAt),
        });
        return rows.map(toItem).filter((item) => item.exam !== null);
      },
    },
  };
}
