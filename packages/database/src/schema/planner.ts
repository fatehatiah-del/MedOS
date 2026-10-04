import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { courses, lectures } from "./academic";
import { id, oneOf, timestamps } from "./columns";
import { resources } from "./resources";
import { ownerId } from "./users";
import { PLAN_ITEM_SOURCES, PLAN_ITEM_STATUSES, STUDY_ACTIVITIES } from "./values";

/** The user's own settings. One row per user, created when first changed. */
export const userSettings = pgTable(
  "user_settings",
  {
    id: id(),
    userId: ownerId(),
    /** Study time available on a weekday and on a weekend day, in minutes. */
    weekdayMinutes: integer("weekday_minutes").notNull(),
    weekendMinutes: integer("weekend_minutes").notNull(),
    ...timestamps,
  },
  (table) => [
    unique("user_settings_user_unique").on(table.userId),
    check(
      "user_settings_minutes_range",
      sql`${table.weekdayMinutes} between 0 and 1440 and ${table.weekendMinutes} between 0 and 1440`,
    ),
  ],
);

/**
 * The plan of one day. Created when the day is first planned, or when an item
 * is postponed to it. `suggested_at` is empty until the planner has proposed
 * items for the day; it never proposes for a day twice on its own.
 */
export const dailyPlans = pgTable(
  "daily_plans",
  {
    id: id(),
    userId: ownerId(),
    date: date("date").notNull(),
    suggestedAt: timestamp("suggested_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("daily_plans_user_date_unique").on(table.userId, table.date),
    // Target of the plan items' composite foreign key.
    unique("daily_plans_id_user_unique").on(table.id, table.userId),
  ],
);

/**
 * One block of a day's plan. A suggestion keeps its key and reasons (why the
 * planner proposed it); once the user changes it, it is marked edited and a
 * refresh of suggestions leaves it alone. Removing a suggestion keeps it as
 * dismissed, so it is not proposed again that day; removing the user's own
 * item deletes it. Postponing keeps the item here as postponed and puts a
 * copy on the next day.
 */
export const dailyPlanItems = pgTable(
  "daily_plan_items",
  {
    id: id(),
    userId: ownerId(),
    planId: uuid("plan_id").notNull(),
    position: integer("position").notNull(),
    source: text("source", { enum: PLAN_ITEM_SOURCES }).notNull(),
    status: text("status", { enum: PLAN_ITEM_STATUSES }).notNull().default("planned"),
    /** The planner's key for what to study, e.g. "flashcards:<course>". Null for the user's own items. */
    suggestionKey: text("suggestion_key"),
    /** True once the user has changed a suggestion. */
    edited: boolean("edited").notNull().default(false),
    activity: text("activity", { enum: STUDY_ACTIVITIES }).notNull(),
    courseId: uuid("course_id"),
    lectureId: uuid("lecture_id"),
    resourceId: uuid("resource_id"),
    title: text("title").notNull(),
    minutes: integer("minutes").notNull(),
    /** The planner's score and its reasons, kept as proposed. */
    score: integer("score"),
    reasons: jsonb("reasons").$type<string[]>().notNull().default([]),
    /** The day an item was postponed from, when it was. */
    postponedFrom: date("postponed_from"),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "daily_plan_items_plan_fk",
      columns: [table.planId, table.userId],
      foreignColumns: [dailyPlans.id, dailyPlans.userId],
    }).onDelete("restrict"),
    foreignKey({
      name: "daily_plan_items_course_fk",
      columns: [table.courseId, table.userId],
      foreignColumns: [courses.id, courses.userId],
    }).onDelete("restrict"),
    foreignKey({
      name: "daily_plan_items_lecture_fk",
      columns: [table.lectureId, table.userId],
      foreignColumns: [lectures.id, lectures.userId],
    }).onDelete("restrict"),
    foreignKey({
      name: "daily_plan_items_resource_fk",
      columns: [table.resourceId, table.userId],
      foreignColumns: [resources.id, resources.userId],
    }).onDelete("restrict"),
    index("daily_plan_items_plan_idx").on(table.planId, table.position),
    check("daily_plan_items_source_valid", oneOf(table.source, PLAN_ITEM_SOURCES)),
    check("daily_plan_items_status_valid", oneOf(table.status, PLAN_ITEM_STATUSES)),
    check("daily_plan_items_activity_valid", oneOf(table.activity, STUDY_ACTIVITIES)),
    check("daily_plan_items_minutes_range", sql`${table.minutes} between 5 and 720`),
    check(
      "daily_plan_items_title_length",
      sql`char_length(btrim(${table.title})) between 1 and 200`,
    ),
    // A suggestion always has its key; the user's own items never do.
    check(
      "daily_plan_items_suggestion_key",
      sql`(${table.source} <> 'suggested' or ${table.suggestionKey} is not null) and (${table.source} <> 'manual' or ${table.suggestionKey} is null)`,
    ),
  ],
);

export type UserSettings = typeof userSettings.$inferSelect;
export type DailyPlan = typeof dailyPlans.$inferSelect;
export type DailyPlanItem = typeof dailyPlanItems.$inferSelect;
export type NewDailyPlanItem = typeof dailyPlanItems.$inferInsert;
