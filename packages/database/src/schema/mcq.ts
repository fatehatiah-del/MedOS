import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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

import { id, oneOf, timestamps } from "./columns";
import { resources } from "./resources";
import { ownerId } from "./users";
import { MCQ_MODES, MCQ_SESSION_STATUSES } from "./values";

/*
 * MCQ practice: sessions and the attempts made in them.
 *
 * Questions are not copied: a session lists the keys (and fingerprints) of
 * the imported questions it uses, in order, so attempts stay attached to the
 * source and can be recognised after a re-import. Every answer in every
 * session is its own attempt; nothing is overwritten. Nothing here affects
 * lecture completion.
 */

/** A question of a session: its key in the set and the fingerprint of its text. */
export interface SessionQuestion {
  key: string;
  fingerprint: string;
}

/** An exam's answers while it is in progress, saved as the user works. */
export interface McqDraft {
  /** Chosen option index by question key. */
  answers: Record<string, number>;
  flagged: string[];
  /** Time spent on each question so far, in milliseconds. */
  timeMs: Record<string, number>;
}

export const mcqSessions = pgTable(
  "mcq_sessions",
  {
    id: id(),
    userId: ownerId(),
    resourceId: uuid("resource_id").notNull(),
    mode: text("mode", { enum: MCQ_MODES }).notNull(),
    status: text("status", { enum: MCQ_SESSION_STATUSES }).notNull().default("in-progress"),
    questions: jsonb("questions").$type<SessionQuestion[]>().notNull(),
    shuffled: boolean("shuffled").notNull().default(false),
    /** Null for an untimed session. */
    timeLimitSeconds: integer("time_limit_seconds"),
    draft: jsonb("draft")
      .$type<McqDraft>()
      .notNull()
      .default({ answers: {}, flagged: [], timeMs: {} }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    /** Seconds from start to submission. */
    elapsedSeconds: integer("elapsed_seconds"),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "mcq_sessions_resource_fk",
      columns: [table.resourceId, table.userId],
      foreignColumns: [resources.id, resources.userId],
    }).onDelete("restrict"),
    unique("mcq_sessions_id_user_unique").on(table.id, table.userId),
    index("mcq_sessions_resource_idx").on(table.resourceId, table.userId),
    check("mcq_sessions_mode_valid", oneOf(table.mode, MCQ_MODES)),
    check("mcq_sessions_status_valid", oneOf(table.status, MCQ_SESSION_STATUSES)),
    check("mcq_sessions_has_questions", sql`jsonb_array_length(${table.questions}) >= 1`),
    check(
      "mcq_sessions_time_limit_positive",
      sql`${table.timeLimitSeconds} is null or ${table.timeLimitSeconds} > 0`,
    ),
    check(
      "mcq_sessions_submission_consistent",
      sql`(${table.status} = 'submitted') = (${table.submittedAt} is not null)`,
    ),
  ],
);

/**
 * One answer to one question in one session. An exam question left
 * unanswered at submission is recorded with no option and no result.
 */
export const mcqAttempts = pgTable(
  "mcq_attempts",
  {
    id: id(),
    userId: ownerId(),
    sessionId: uuid("session_id").notNull(),
    resourceId: uuid("resource_id").notNull(),
    mode: text("mode", { enum: MCQ_MODES }).notNull(),
    questionKey: text("question_key").notNull(),
    questionFingerprint: text("question_fingerprint").notNull(),
    selectedOption: integer("selected_option"),
    /** Null when unanswered, or when the source states no answer to score against. */
    correct: boolean("correct"),
    timeSpentMs: integer("time_spent_ms").notNull().default(0),
    /** The user's n-th attempt at this question, across all sessions. */
    attemptNumber: integer("attempt_number").notNull(),
    flagged: boolean("flagged").notNull().default(false),
    answeredAt: timestamp("answered_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "mcq_attempts_session_fk",
      columns: [table.sessionId, table.userId],
      foreignColumns: [mcqSessions.id, mcqSessions.userId],
    }).onDelete("restrict"),
    foreignKey({
      name: "mcq_attempts_resource_fk",
      columns: [table.resourceId, table.userId],
      foreignColumns: [resources.id, resources.userId],
    }).onDelete("restrict"),
    // A question is answered once per session; repeats are new sessions.
    unique("mcq_attempts_session_question_unique").on(table.sessionId, table.questionKey),
    index("mcq_attempts_question_idx").on(
      table.userId,
      table.resourceId,
      table.questionFingerprint,
    ),
    check("mcq_attempts_mode_valid", oneOf(table.mode, MCQ_MODES)),
    check("mcq_attempts_key_format", sql`${table.questionKey} ~ '^q[0-9]+$'`),
    check("mcq_attempts_fingerprint_format", sql`${table.questionFingerprint} ~ '^[0-9a-f]{16}$'`),
    check(
      "mcq_attempts_selected_valid",
      sql`${table.selectedOption} is null or ${table.selectedOption} >= 0`,
    ),
    check(
      "mcq_attempts_unanswered_unscored",
      sql`${table.selectedOption} is not null or ${table.correct} is null`,
    ),
    check("mcq_attempts_time_not_negative", sql`${table.timeSpentMs} >= 0`),
    check("mcq_attempts_number_positive", sql`${table.attemptNumber} >= 1`),
  ],
);

export type McqSession = typeof mcqSessions.$inferSelect;
export type McqAttempt = typeof mcqAttempts.$inferSelect;
