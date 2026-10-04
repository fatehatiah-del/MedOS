import { CARD_STATES, REVIEW_RATINGS } from "@medos/fsrs";
import { sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { courses, lectures } from "./academic";
import { id, oneOf, timestamps } from "./columns";
import { resources } from "./resources";
import { ownerId } from "./users";
import { FLASHCARD_ORIGINS } from "./values";

/*
 * Flashcards, scheduled with FSRS. Every deck belongs to one course, so a
 * review session can never mix courses by accident. A card made from a Study
 * Guide keeps the anchor of the passage it came from. Deleting a card hides it
 * but keeps its review history. Nothing here affects lecture completion.
 */

const SECTION_ID = sql.raw(`'^[a-z0-9]+(-[a-z0-9]+)*$'`);

/** A deck of one course: the deck of a lecture, or one the user made for the course. */
export const flashcardDecks = pgTable(
  "flashcard_decks",
  {
    id: id(),
    userId: ownerId(),
    courseId: uuid("course_id").notNull(),
    /** Set for a lecture's own deck; null for a course-level deck. */
    lectureId: uuid("lecture_id"),
    name: text("name").notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "flashcard_decks_course_fk",
      columns: [table.courseId, table.userId],
      foreignColumns: [courses.id, courses.userId],
    }).onDelete("restrict"),
    // A lecture deck's lecture must belong to the deck's course.
    foreignKey({
      name: "flashcard_decks_lecture_fk",
      columns: [table.lectureId, table.courseId, table.userId],
      foreignColumns: [lectures.id, lectures.courseId, lectures.userId],
    }).onDelete("restrict"),
    unique("flashcard_decks_id_user_unique").on(table.id, table.userId),
    uniqueIndex("flashcard_decks_lecture_unique")
      .on(table.lectureId)
      .where(sql`${table.lectureId} is not null`),
    index("flashcard_decks_course_idx").on(table.courseId, table.userId),
    check("flashcard_decks_name_length", sql`char_length(btrim(${table.name})) between 1 and 200`),
  ],
);

export const flashcards = pgTable(
  "flashcards",
  {
    id: id(),
    userId: ownerId(),
    deckId: uuid("deck_id").notNull(),
    front: text("front").notNull(),
    back: text("back").notNull(),
    origin: text("origin", { enum: FLASHCARD_ORIGINS }).notNull().default("manual"),
    /** For a card made from a Study Guide: the guide and the passage, as an anchor. */
    sourceResourceId: uuid("source_resource_id"),
    sourceSectionId: text("source_section_id"),
    sourceUnitPath: text("source_unit_path"),
    sourceStart: integer("source_start"),
    sourceEnd: integer("source_end"),
    sourceQuote: text("source_quote"),
    /* FSRS scheduling state. */
    due: timestamp("due", { withTimezone: true }).notNull(),
    stability: doublePrecision("stability").notNull().default(0),
    difficulty: doublePrecision("difficulty").notNull().default(0),
    scheduledDays: integer("scheduled_days").notNull().default(0),
    learningSteps: integer("learning_steps").notNull().default(0),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    state: text("state", { enum: CARD_STATES }).notNull().default("new"),
    lastReview: timestamp("last_review", { withTimezone: true }),
    /** Set when the user deletes the card; its review history is kept. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "flashcards_deck_fk",
      columns: [table.deckId, table.userId],
      foreignColumns: [flashcardDecks.id, flashcardDecks.userId],
    }).onDelete("restrict"),
    foreignKey({
      name: "flashcards_source_fk",
      columns: [table.sourceResourceId, table.userId],
      foreignColumns: [resources.id, resources.userId],
    }).onDelete("restrict"),
    unique("flashcards_id_user_unique").on(table.id, table.userId),
    index("flashcards_deck_due_idx").on(table.deckId, table.due),
    check("flashcards_origin_valid", oneOf(table.origin, FLASHCARD_ORIGINS)),
    check("flashcards_state_valid", oneOf(table.state, CARD_STATES)),
    check("flashcards_front_length", sql`char_length(btrim(${table.front})) between 1 and 5000`),
    check("flashcards_back_length", sql`char_length(btrim(${table.back})) between 1 and 5000`),
    check(
      "flashcards_source_consistent",
      sql`(${table.origin} = 'study-guide') = (${table.sourceResourceId} is not null)`,
    ),
    check(
      "flashcards_source_section_format",
      sql`${table.sourceSectionId} is null or ${table.sourceSectionId} ~ ${SECTION_ID}`,
    ),
    check(
      "flashcards_counts_not_negative",
      sql`${table.reps} >= 0 and ${table.lapses} >= 0 and ${table.scheduledDays} >= 0 and ${table.learningSteps} >= 0`,
    ),
  ],
);

/** One rating of one card, with its schedule before and after. Never changed. */
export const flashcardReviews = pgTable(
  "flashcard_reviews",
  {
    id: id(),
    userId: ownerId(),
    cardId: uuid("card_id").notNull(),
    rating: text("rating", { enum: REVIEW_RATINGS }).notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull(),
    /** How long the user looked at the card before rating it. */
    durationMs: integer("duration_ms").notNull().default(0),
    stateBefore: text("state_before", { enum: CARD_STATES }).notNull(),
    dueBefore: timestamp("due_before", { withTimezone: true }).notNull(),
    stateAfter: text("state_after", { enum: CARD_STATES }).notNull(),
    dueAfter: timestamp("due_after", { withTimezone: true }).notNull(),
    stabilityAfter: doublePrecision("stability_after").notNull(),
    difficultyAfter: doublePrecision("difficulty_after").notNull(),
    scheduledDaysAfter: integer("scheduled_days_after").notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "flashcard_reviews_card_fk",
      columns: [table.cardId, table.userId],
      foreignColumns: [flashcards.id, flashcards.userId],
    }).onDelete("restrict"),
    index("flashcard_reviews_card_idx").on(table.cardId, table.reviewedAt),
    index("flashcard_reviews_user_time_idx").on(table.userId, table.reviewedAt),
    check("flashcard_reviews_rating_valid", oneOf(table.rating, REVIEW_RATINGS)),
    check("flashcard_reviews_state_before_valid", oneOf(table.stateBefore, CARD_STATES)),
    check("flashcard_reviews_state_after_valid", oneOf(table.stateAfter, CARD_STATES)),
    check("flashcard_reviews_duration_not_negative", sql`${table.durationMs} >= 0`),
  ],
);

export type FlashcardDeck = typeof flashcardDecks.$inferSelect;
export type Flashcard = typeof flashcards.$inferSelect;
export type FlashcardReview = typeof flashcardReviews.$inferSelect;
