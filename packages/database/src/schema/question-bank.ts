import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { id, oneOf, timestamps } from "./columns";
import { resources } from "./resources";
import { ownerId } from "./users";
import { RECALL_RATINGS } from "./values";

/*
 * Active recall on Question Bank items: each time the user reveals a model
 * answer is an attempt, with what they typed (if anything) and how well they
 * judged they recalled it. Items are not copied: an attempt names the item by
 * key and fingerprint, so it stays attached to the source after a re-import.
 * Nothing here affects lecture completion.
 */
export const questionBankAttempts = pgTable(
  "question_bank_attempts",
  {
    id: id(),
    userId: ownerId(),
    resourceId: uuid("resource_id").notNull(),
    itemKey: text("item_key").notNull(),
    itemFingerprint: text("item_fingerprint").notNull(),
    /** What the user typed before revealing; typing is optional. */
    typedAnswer: text("typed_answer"),
    revealedAt: timestamp("revealed_at", { withTimezone: true }).notNull(),
    /** Again, Hard, Good or Easy; empty until the user rates. */
    rating: text("rating", { enum: RECALL_RATINGS }),
    ratedAt: timestamp("rated_at", { withTimezone: true }),
    timeSpentMs: integer("time_spent_ms").notNull().default(0),
    /** The user's n-th attempt at this item. */
    attemptNumber: integer("attempt_number").notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "question_bank_attempts_resource_fk",
      columns: [table.resourceId, table.userId],
      foreignColumns: [resources.id, resources.userId],
    }).onDelete("restrict"),
    index("question_bank_attempts_item_idx").on(
      table.userId,
      table.resourceId,
      table.itemFingerprint,
    ),
    check(
      "question_bank_attempts_rating_valid",
      sql`${table.rating} is null or ${oneOf(table.rating, RECALL_RATINGS)}`,
    ),
    check(
      "question_bank_attempts_rated_consistent",
      sql`(${table.rating} is null) = (${table.ratedAt} is null)`,
    ),
    check("question_bank_attempts_key_format", sql`${table.itemKey} ~ '^q[0-9]+$'`),
    check(
      "question_bank_attempts_fingerprint_format",
      sql`${table.itemFingerprint} ~ '^[0-9a-f]{16}$'`,
    ),
    check(
      "question_bank_attempts_typed_length",
      sql`${table.typedAnswer} is null or char_length(${table.typedAnswer}) <= 10000`,
    ),
    check("question_bank_attempts_time_not_negative", sql`${table.timeSpentMs} >= 0`),
    check("question_bank_attempts_number_positive", sql`${table.attemptNumber} >= 1`),
  ],
);

export type QuestionBankAttempt = typeof questionBankAttempts.$inferSelect;
