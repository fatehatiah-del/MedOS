import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { courses } from "./academic";
import { id, oneOf, timestamps } from "./columns";
import { ownerId } from "./users";
import { CALENDAR_EVENT_ORIGINS, CALENDAR_EVENT_TYPES, EXAM_KINDS } from "./values";

/**
 * Anything with a place in time: timetable lectures and labs, exams, academic
 * deadlines, holidays, and the user's own study sessions.
 *
 * Times are stored as UTC instants. `timezone` records the IANA zone the event
 * was defined in, so it is displayed at the intended wall-clock time (and
 * all-day events fall on the intended dates) regardless of where the server or
 * browser happens to be.
 */
export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: id(),
    userId: ownerId(),
    /** The course the event belongs to, if any. Holidays and personal events have none. */
    courseId: uuid("course_id"),
    type: text("type", { enum: CALENDAR_EVENT_TYPES }).notNull(),
    origin: text("origin", { enum: CALENDAR_EVENT_ORIGINS }).notNull(),
    title: text("title").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    allDay: boolean("all_day").notNull().default(false),
    timezone: text("timezone").notNull(),
    location: text("location"),
    /** Lab group a timetable event is for, e.g. "A". Empty for shared lectures. */
    studentGroup: text("student_group"),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "calendar_events_course_fk",
      columns: [table.courseId, table.userId],
      foreignColumns: [courses.id, courses.userId],
    }).onDelete("restrict"),
    // Target of the exam_events foreign key.
    unique("calendar_events_id_user_course_unique").on(table.id, table.userId, table.courseId),
    // "What is scheduled between these dates?"
    index("calendar_events_user_starts_idx").on(table.userId, table.startsAt),
    index("calendar_events_course_idx").on(table.courseId),
    check("calendar_events_type_valid", oneOf(table.type, CALENDAR_EVENT_TYPES)),
    check("calendar_events_origin_valid", oneOf(table.origin, CALENDAR_EVENT_ORIGINS)),
    check("calendar_events_time_order", sql`${table.endsAt} >= ${table.startsAt}`),
  ],
);

/**
 * Exam-specific detail for a calendar event. The event holds the date and
 * time; this row marks it as an examination of one course, and is what a
 * future revision plan and exam scope will attach to.
 *
 * The composite foreign key makes the exam's course identical to the event's
 * course, so the two can never disagree.
 */
export const examEvents = pgTable(
  "exam_events",
  {
    id: id(),
    userId: ownerId(),
    calendarEventId: uuid("calendar_event_id").notNull(),
    courseId: uuid("course_id").notNull(),
    kind: text("kind", { enum: EXAM_KINDS }).notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "exam_events_calendar_event_fk",
      columns: [table.calendarEventId, table.userId, table.courseId],
      foreignColumns: [calendarEvents.id, calendarEvents.userId, calendarEvents.courseId],
    }).onDelete("restrict"),
    unique("exam_events_calendar_event_unique").on(table.calendarEventId),
    // "Exams of this course."
    index("exam_events_course_idx").on(table.courseId),
    check("exam_events_kind_valid", oneOf(table.kind, EXAM_KINDS)),
  ],
);

export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type NewCalendarEvent = typeof calendarEvents.$inferInsert;
export type ExamEvent = typeof examEvents.$inferSelect;
export type NewExamEvent = typeof examEvents.$inferInsert;
