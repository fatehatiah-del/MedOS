import { type SQL, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { id, isSlug, timestamps } from "./columns";
import { ownerId } from "./users";

/*
 * The academic hierarchy: Semester → Course → Week → 0..n Lectures.
 *
 * Ownership is enforced by the database, not only by queries. Each table has a
 * UNIQUE constraint that includes `user_id`, and children reference it with a
 * composite foreign key, so a row can never be attached to another user's
 * parent. All foreign keys are ON DELETE RESTRICT: nothing is removed as a
 * side effect of deleting something else.
 */

/** An optional date range: either both ends are set and ordered, or neither is set. */
function optionalPeriod(start: AnyPgColumn, end: AnyPgColumn): SQL {
  return sql`(${start} is null and ${end} is null) or (${start} is not null and ${end} is not null and ${end} >= ${start})`;
}

export const semesters = pgTable(
  "semesters",
  {
    id: id(),
    userId: ownerId(),
    /** Stable, URL-safe identifier, e.g. "2026-fall". */
    slug: text("slug").notNull(),
    /** e.g. "Fall 2026" */
    name: text("name").notNull(),
    /** e.g. "Semester 5" */
    label: text("label").notNull(),
    academicYear: text("academic_year"),
    institution: text("institution"),
    programme: text("programme"),
    /** The user's lab group, e.g. "A". Only this group's labs belong in the timetable. */
    studentGroup: text("student_group"),
    // Academic dates are calendar days, not instants.
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    midtermsStartOn: date("midterms_start_on"),
    midtermsEndOn: date("midterms_end_on"),
    finalsStartOn: date("finals_start_on"),
    finalsEndOn: date("finals_end_on"),
    ...timestamps,
  },
  (table) => [
    unique("semesters_user_slug_unique").on(table.userId, table.slug),
    unique("semesters_id_user_unique").on(table.id, table.userId),
    check("semesters_slug_format", isSlug(table.slug)),
    check("semesters_term_order", sql`${table.endsOn} >= ${table.startsOn}`),
    check("semesters_midterms_period", optionalPeriod(table.midtermsStartOn, table.midtermsEndOn)),
    check("semesters_finals_period", optionalPeriod(table.finalsStartOn, table.finalsEndOn)),
  ],
);

export const courses = pgTable(
  "courses",
  {
    id: id(),
    userId: ownerId(),
    semesterId: uuid("semester_id").notNull(),
    /** Stable, URL-safe identifier within the semester, e.g. "public-health". */
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    shortName: text("short_name").notNull(),
    /** Official course code, when the university publishes one. */
    code: text("code"),
    /** Name of the design token for the course's identity colour. Presentation only. */
    colorToken: text("color_token"),
    /** Display order within the semester. */
    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "courses_semester_fk",
      columns: [table.semesterId, table.userId],
      foreignColumns: [semesters.id, semesters.userId],
    }).onDelete("restrict"),
    // Also serves "courses by semester".
    unique("courses_semester_slug_unique").on(table.semesterId, table.slug),
    unique("courses_id_user_unique").on(table.id, table.userId),
    check("courses_slug_format", isSlug(table.slug)),
  ],
);

export const weeks = pgTable(
  "weeks",
  {
    id: id(),
    userId: ownerId(),
    courseId: uuid("course_id").notNull(),
    /** Teaching week of the semester, starting at 1. */
    number: integer("number").notNull(),
    startsOn: date("starts_on"),
    endsOn: date("ends_on"),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "weeks_course_fk",
      columns: [table.courseId, table.userId],
      foreignColumns: [courses.id, courses.userId],
    }).onDelete("restrict"),
    // One row per teaching week per course. Also serves "weeks by course".
    unique("weeks_course_number_unique").on(table.courseId, table.number),
    // Target of the lectures foreign key.
    unique("weeks_id_course_user_unique").on(table.id, table.courseId, table.userId),
    check("weeks_number_positive", sql`${table.number} >= 1`),
    check(
      "weeks_date_order",
      sql`${table.startsOn} is null or ${table.endsOn} is null or ${table.endsOn} >= ${table.startsOn}`,
    ),
  ],
);

/**
 * A lecture belongs to exactly one week, and a week holds any number of
 * lectures (including none): nothing here limits a week to one lecture.
 *
 * `course_id` is stored alongside `week_id` so lectures can be listed by
 * course directly. The composite foreign key guarantees it always matches the
 * week's own course.
 *
 * Completion is not a property of the lecture. It is recorded in
 * `lecture_progress` and only ever set by an explicit user action.
 */
export const lectures = pgTable(
  "lectures",
  {
    id: id(),
    userId: ownerId(),
    courseId: uuid("course_id").notNull(),
    weekId: uuid("week_id").notNull(),
    /** Order of the lecture within its week, starting at 1. */
    number: integer("number").notNull(),
    title: text("title").notNull(),
    /** The day the lecture was given, when known. */
    heldOn: date("held_on"),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "lectures_week_fk",
      columns: [table.weekId, table.courseId, table.userId],
      foreignColumns: [weeks.id, weeks.courseId, weeks.userId],
    }).onDelete("restrict"),
    // Also serves "lectures by week".
    unique("lectures_week_number_unique").on(table.weekId, table.number),
    unique("lectures_id_user_unique").on(table.id, table.userId),
    // Lets a lecture deck require that its lecture belongs to the deck's course.
    unique("lectures_id_course_user_unique").on(table.id, table.courseId, table.userId),
    index("lectures_course_idx").on(table.courseId),
    check("lectures_number_positive", sql`${table.number} >= 1`),
  ],
);

export type Semester = typeof semesters.$inferSelect;
export type NewSemester = typeof semesters.$inferInsert;
export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;
export type Week = typeof weeks.$inferSelect;
export type NewWeek = typeof weeks.$inferInsert;
export type Lecture = typeof lectures.$inferSelect;
export type NewLecture = typeof lectures.$inferInsert;
