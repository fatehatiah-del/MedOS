import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import { id, timestamps } from "./columns";
import { resources } from "./resources";
import { ownerId } from "./users";

/*
 * Review Later on questions: an MCQ or a Question Bank item the user wants to
 * come back to. The question is named by key and fingerprint, so the item
 * stays attached to the source after a re-import (and is reported when the
 * question is gone). Study Guide passages and lecture pages have their own
 * Review Later items (Phases 7 and 8). Nothing here affects completion.
 */
export const questionReviewItems = pgTable(
  "question_review_items",
  {
    id: id(),
    userId: ownerId(),
    /** The quiz or question bank. */
    resourceId: uuid("resource_id").notNull(),
    questionKey: text("question_key").notNull(),
    questionFingerprint: text("question_fingerprint").notNull(),
    /** The user's own words about why, if any. */
    note: text("note"),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "question_review_items_resource_fk",
      columns: [table.resourceId, table.userId],
      foreignColumns: [resources.id, resources.userId],
    }).onDelete("restrict"),
    unique("question_review_items_question_unique").on(table.resourceId, table.questionKey),
    index("question_review_items_user_idx").on(table.userId, table.createdAt),
    check("question_review_items_key_format", sql`${table.questionKey} ~ '^q[0-9]+$'`),
    check(
      "question_review_items_fingerprint_format",
      sql`${table.questionFingerprint} ~ '^[0-9a-f]{16}$'`,
    ),
    check(
      "question_review_items_note_length",
      sql`${table.note} is null or char_length(btrim(${table.note})) between 1 and 10000`,
    ),
  ],
);

export type QuestionReviewItem = typeof questionReviewItems.$inferSelect;
