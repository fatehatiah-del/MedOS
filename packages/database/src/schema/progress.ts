import { eq, sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  pgView,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { courses, lectures } from "./academic";
import { id, oneOf, timestamps } from "./columns";
import { ownerId } from "./users";
import { STUDY_ACTIVITIES } from "./values";

/**
 * The user's state for one lecture.
 *
 * `completed_at` is empty until the user explicitly marks the lecture
 * complete, and is cleared if they undo it. Nothing in MedOS may set it as a
 * consequence of other activity (quiz scores, reading progress, reviews).
 */
export const lectureProgress = pgTable(
  "lecture_progress",
  {
    id: id(),
    userId: ownerId(),
    lectureId: uuid("lecture_id").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "lecture_progress_lecture_fk",
      columns: [table.lectureId, table.userId],
      foreignColumns: [lectures.id, lectures.userId],
    }).onDelete("restrict"),
    unique("lecture_progress_lecture_unique").on(table.lectureId),
  ],
);

/**
 * One timed stretch of study. `ended_at` is empty while the session is open.
 * `active_seconds` counts only active time, so pauses are excluded.
 */
export const studySessions = pgTable(
  "study_sessions",
  {
    id: id(),
    userId: ownerId(),
    courseId: uuid("course_id"),
    lectureId: uuid("lecture_id"),
    activity: text("activity", { enum: STUDY_ACTIVITIES }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    activeSeconds: integer("active_seconds").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "study_sessions_course_fk",
      columns: [table.courseId, table.userId],
      foreignColumns: [courses.id, courses.userId],
    }).onDelete("restrict"),
    foreignKey({
      name: "study_sessions_lecture_fk",
      columns: [table.lectureId, table.userId],
      foreignColumns: [lectures.id, lectures.userId],
    }).onDelete("restrict"),
    // "Study time in this period."
    index("study_sessions_user_started_idx").on(table.userId, table.startedAt),
    index("study_sessions_course_idx").on(table.courseId),
    index("study_sessions_lecture_idx").on(table.lectureId),
    check("study_sessions_activity_valid", oneOf(table.activity, STUDY_ACTIVITIES)),
    check("study_sessions_active_not_negative", sql`${table.activeSeconds} >= 0`),
    check(
      "study_sessions_time_order",
      sql`${table.endedAt} is null or ${table.endedAt} >= ${table.startedAt}`,
    ),
  ],
);

/**
 * Course completion, computed rather than stored: one row per course with the
 * number of lectures and how many the user has marked complete. Being a view,
 * it cannot drift from `lecture_progress`.
 */
export const courseProgress = pgView("course_progress").as((qb) =>
  qb
    .select({
      courseId: sql<string>`${courses.id}`.as("course_id"),
      userId: sql<string>`${courses.userId}`.as("user_id"),
      lectureCount: sql<number>`count(${lectures.id})::int`.as("lecture_count"),
      completedLectureCount: sql<number>`count(${lectureProgress.completedAt})::int`.as(
        "completed_lecture_count",
      ),
    })
    .from(courses)
    .leftJoin(lectures, eq(lectures.courseId, courses.id))
    .leftJoin(lectureProgress, eq(lectureProgress.lectureId, lectures.id))
    .groupBy(courses.id, courses.userId),
);

export type LectureProgress = typeof lectureProgress.$inferSelect;
export type NewLectureProgress = typeof lectureProgress.$inferInsert;
export type StudySession = typeof studySessions.$inferSelect;
export type NewStudySession = typeof studySessions.$inferInsert;
export type CourseProgress = typeof courseProgress.$inferSelect;
