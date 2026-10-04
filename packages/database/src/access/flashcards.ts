import {
  type CardSchedule,
  type ReviewRating,
  newSchedule,
  review as scheduleReview,
} from "@medos/fsrs";
import { isUnitPath, studyGuideTextUnits, unitText, validateContent } from "@medos/parsers/model";
import { and, asc, count, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";

import type { Database } from "../client";
import {
  type Flashcard,
  type FlashcardDeck,
  type FlashcardReview,
  courses,
  flashcardDecks,
  flashcardReviews,
  flashcards,
  lectures,
  resources,
  weeks,
} from "../schema";

/*
 * Flashcards at the trusted boundary. Decks belong to one course; a review
 * session is always built from one course (or one deck), never across
 * courses. Scheduling is FSRS (@medos/fsrs), computed here on the server.
 * Deleting a card hides it and keeps its history. A deck or card that is not
 * the user's behaves exactly like one that does not exist. Nothing here
 * changes lecture completion.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECTION_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const isId = (value: string) => UUID.test(value);

export const MAX_CARD_TEXT = 5000;
/** New cards introduced per course per day, unless the caller chooses otherwise. */
export const DEFAULT_NEW_PER_DAY = 20;

export interface DeckSummary {
  deck: FlashcardDeck;
  course: { id: string; slug: string; name: string; shortName: string; colorToken: string | null };
  lecture: { id: string; number: number; title: string; weekNumber: number } | null;
  total: number;
  /** Cards already learnt that are due now. */
  due: number;
  /** Cards never reviewed. */
  fresh: number;
}

export interface CardText {
  front: string;
  back: string;
}

export type CardResult =
  { ok: true; card: Flashcard } | { ok: false; reason: "not-found" | "invalid" | "text-mismatch" };

export interface ReviewQueue {
  /** Cards to review now, due ones first, then new ones within today's limit. */
  cards: Flashcard[];
  due: number;
  /** New cards that may still be introduced today. */
  newAvailable: number;
  newIntroducedToday: number;
}

function scheduleOf(card: Flashcard): CardSchedule {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduledDays,
    learningSteps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.lastReview,
  };
}

const cleanText = (value: string) => value.replace(/\r\n/g, "\n").trim();
const validText = (value: string) => value.length >= 1 && value.length <= MAX_CARD_TEXT;

export function createFlashcardAccess(db: Database, userId: string) {
  const liveCard = and(eq(flashcards.userId, userId), isNull(flashcards.deletedAt));

  async function deckRows(where: ReturnType<typeof and>) {
    return db
      .select({
        deck: flashcardDecks,
        course: {
          id: courses.id,
          slug: courses.slug,
          name: courses.name,
          shortName: courses.shortName,
          colorToken: courses.colorToken,
        },
        lectureId: lectures.id,
        lectureNumber: lectures.number,
        lectureTitle: lectures.title,
        weekNumber: weeks.number,
      })
      .from(flashcardDecks)
      .innerJoin(courses, and(eq(courses.id, flashcardDecks.courseId), eq(courses.userId, userId)))
      .leftJoin(
        lectures,
        and(eq(lectures.id, flashcardDecks.lectureId), eq(lectures.userId, userId)),
      )
      .leftJoin(weeks, and(eq(weeks.id, lectures.weekId), eq(weeks.userId, userId)))
      .where(and(eq(flashcardDecks.userId, userId), where))
      .orderBy(
        asc(courses.position),
        asc(weeks.number),
        asc(lectures.number),
        asc(flashcardDecks.name),
      );
  }

  async function summarise(
    rows: Awaited<ReturnType<typeof deckRows>>,
    now: Date,
  ): Promise<DeckSummary[]> {
    if (rows.length === 0) return [];
    const counts = await db
      .select({
        deckId: flashcards.deckId,
        total: count(),
        due: sql<number>`(count(*) filter (where ${flashcards.state} <> 'new' and ${flashcards.due} <= ${now.toISOString()}::timestamptz))::int`,
        fresh: sql<number>`(count(*) filter (where ${flashcards.state} = 'new'))::int`,
      })
      .from(flashcards)
      .where(
        and(
          liveCard,
          inArray(
            flashcards.deckId,
            rows.map((row) => row.deck.id),
          ),
        ),
      )
      .groupBy(flashcards.deckId);
    const byDeck = new Map(counts.map((row) => [row.deckId, row]));
    return rows.map((row) => ({
      deck: row.deck,
      course: row.course,
      lecture:
        row.lectureId !== null &&
        row.lectureNumber !== null &&
        row.lectureTitle !== null &&
        row.weekNumber !== null
          ? {
              id: row.lectureId,
              number: row.lectureNumber,
              title: row.lectureTitle,
              weekNumber: row.weekNumber,
            }
          : null,
      total: byDeck.get(row.deck.id)?.total ?? 0,
      due: byDeck.get(row.deck.id)?.due ?? 0,
      fresh: byDeck.get(row.deck.id)?.fresh ?? 0,
    }));
  }

  async function getDeck(deckId: string, now = new Date()): Promise<DeckSummary | null> {
    if (!isId(deckId)) return null;
    const [summary] = await summarise(await deckRows(eq(flashcardDecks.id, deckId)), now);
    return summary ?? null;
  }

  /** The lecture's own deck, created the first time it is needed. Null if the lecture is not the user's. */
  async function lectureDeck(lectureId: string): Promise<FlashcardDeck | null> {
    if (!isId(lectureId)) return null;
    const [existing] = await db
      .select()
      .from(flashcardDecks)
      .where(and(eq(flashcardDecks.lectureId, lectureId), eq(flashcardDecks.userId, userId)));
    if (existing) return existing;
    const [lecture] = await db
      .select({
        id: lectures.id,
        courseId: lectures.courseId,
        title: lectures.title,
        weekNumber: weeks.number,
      })
      .from(lectures)
      .innerJoin(weeks, and(eq(weeks.id, lectures.weekId), eq(weeks.userId, userId)))
      .where(and(eq(lectures.id, lectureId), eq(lectures.userId, userId)));
    if (!lecture) return null;
    await db
      .insert(flashcardDecks)
      .values({
        userId,
        courseId: lecture.courseId,
        lectureId: lecture.id,
        name: `Week ${lecture.weekNumber} · ${lecture.title}`,
      })
      .onConflictDoNothing();
    const [deck] = await db
      .select()
      .from(flashcardDecks)
      .where(and(eq(flashcardDecks.lectureId, lectureId), eq(flashcardDecks.userId, userId)));
    return deck ?? null;
  }

  async function getCard(cardId: string): Promise<Flashcard | null> {
    if (!isId(cardId)) return null;
    const [card] = await db
      .select()
      .from(flashcards)
      .where(and(eq(flashcards.id, cardId), liveCard));
    return card ?? null;
  }

  async function insertCard(
    deckId: string,
    text: CardText,
    source: Partial<
      Pick<
        Flashcard,
        | "sourceResourceId"
        | "sourceSectionId"
        | "sourceUnitPath"
        | "sourceStart"
        | "sourceEnd"
        | "sourceQuote"
      >
    > & {
      origin: Flashcard["origin"];
    },
    now: Date,
  ): Promise<CardResult> {
    const front = cleanText(text.front);
    const back = cleanText(text.back);
    if (!validText(front) || !validText(back)) return { ok: false, reason: "invalid" };
    const schedule = newSchedule(now);
    const [card] = await db
      .insert(flashcards)
      .values({
        userId,
        deckId,
        front,
        back,
        ...source,
        due: schedule.due,
        stability: schedule.stability,
        difficulty: schedule.difficulty,
        scheduledDays: schedule.scheduledDays,
        learningSteps: schedule.learningSteps,
        reps: schedule.reps,
        lapses: schedule.lapses,
        state: schedule.state,
        lastReview: schedule.lastReview,
      })
      .returning();
    return card ? { ok: true, card } : { ok: false, reason: "invalid" };
  }

  return {
    decks: {
      /** The user's decks, optionally of one course, with their counts. */
      async list(courseId: string | null = null, now = new Date()): Promise<DeckSummary[]> {
        if (courseId !== null && !isId(courseId)) return [];
        return summarise(
          await deckRows(courseId === null ? undefined : eq(flashcardDecks.courseId, courseId)),
          now,
        );
      },
      get: getDeck,
      forLecture: lectureDeck,

      /** A course-level deck the user names. */
      async create(courseId: string, name: string): Promise<FlashcardDeck | null> {
        if (!isId(courseId)) return null;
        const clean = name.trim();
        if (clean.length < 1 || clean.length > 200) return null;
        const [course] = await db
          .select({ id: courses.id })
          .from(courses)
          .where(and(eq(courses.id, courseId), eq(courses.userId, userId)));
        if (!course) return null;
        const [deck] = await db
          .insert(flashcardDecks)
          .values({ userId, courseId, name: clean })
          .returning();
        return deck ?? null;
      },

      /** A lecture's deck counts, for the lecture page; null when it has no deck yet. */
      async lectureSummary(lectureId: string, now = new Date()): Promise<DeckSummary | null> {
        if (!isId(lectureId)) return null;
        const [summary] = await summarise(
          await deckRows(eq(flashcardDecks.lectureId, lectureId)),
          now,
        );
        return summary ?? null;
      },
    },

    cards: {
      get: getCard,

      async list(deckId: string): Promise<Flashcard[]> {
        if (!isId(deckId)) return [];
        return db
          .select()
          .from(flashcards)
          .where(and(eq(flashcards.deckId, deckId), liveCard))
          .orderBy(asc(flashcards.createdAt));
      },

      /** A card the user writes, in one of their decks. */
      async create(deckId: string, text: CardText, now = new Date()): Promise<CardResult> {
        const deck = await getDeck(deckId, now);
        if (!deck) return { ok: false, reason: "not-found" };
        return insertCard(deckId, text, { origin: "manual" }, now);
      },

      /**
       * A card made from selected Study Guide text, in the deck of the
       * guide's lecture. The passage is checked against the guide's own text
       * and kept as the card's source.
       */
      async createFromStudyGuide(
        resourceId: string,
        input: CardText & {
          sectionId: string | null;
          unitPath: string;
          start: number;
          end: number;
          quote: string;
        },
        now = new Date(),
      ): Promise<CardResult> {
        if (!isId(resourceId)) return { ok: false, reason: "not-found" };
        const row = await db.query.resources.findFirst({
          where: and(eq(resources.id, resourceId), eq(resources.userId, userId)),
          columns: { id: true, kind: true, lectureId: true },
          with: { content: { columns: { content: true } } },
        });
        if (!row || row.kind !== "study-guide" || !row.content)
          return { ok: false, reason: "not-found" };
        const guide = validateContent(row.content.content);
        if (guide.format !== "study-guide") return { ok: false, reason: "not-found" };
        if (input.sectionId !== null && !SECTION_ID.test(input.sectionId))
          return { ok: false, reason: "invalid" };
        if (!isUnitPath(input.unitPath)) return { ok: false, reason: "invalid" };
        const unit = studyGuideTextUnits(guide, input.sectionId)?.get(input.unitPath);
        if (!unit) return { ok: false, reason: "invalid" };
        const text = unitText(unit);
        const { start, end } = input;
        if (
          !Number.isInteger(start) ||
          !Number.isInteger(end) ||
          start < 0 ||
          end <= start ||
          end > text.length
        ) {
          return { ok: false, reason: "invalid" };
        }
        if (text.slice(start, end) !== input.quote) return { ok: false, reason: "text-mismatch" };

        const deck = await lectureDeck(row.lectureId);
        if (!deck) return { ok: false, reason: "not-found" };
        return insertCard(
          deck.id,
          input,
          {
            origin: "study-guide",
            sourceResourceId: resourceId,
            sourceSectionId: input.sectionId,
            sourceUnitPath: input.unitPath,
            sourceStart: start,
            sourceEnd: end,
            sourceQuote: input.quote,
          },
          now,
        );
      },

      async update(cardId: string, text: CardText): Promise<Flashcard | null> {
        if (!isId(cardId)) return null;
        const front = cleanText(text.front);
        const back = cleanText(text.back);
        if (!validText(front) || !validText(back)) return null;
        const [card] = await db
          .update(flashcards)
          .set({ front, back })
          .where(and(eq(flashcards.id, cardId), liveCard))
          .returning();
        return card ?? null;
      },

      /** Deletes a card: it disappears from decks and reviews; its history is kept. */
      async remove(cardId: string, now = new Date()): Promise<boolean> {
        if (!isId(cardId)) return false;
        const removed = await db
          .update(flashcards)
          .set({ deletedAt: now })
          .where(and(eq(flashcards.id, cardId), liveCard))
          .returning({ id: flashcards.id });
        return removed.length > 0;
      },
    },

    review: {
      /**
       * What to review now in one course, or one deck: due cards first (the
       * longest overdue first), then new cards in the order they were made,
       * up to the day's new-card limit for that course.
       */
      async queue(
        scope: { courseId: string } | { deckId: string },
        options: { now: Date; dayStart: Date; newPerDay?: number },
      ): Promise<ReviewQueue | null> {
        const { now, dayStart } = options;
        const newPerDay = options.newPerDay ?? DEFAULT_NEW_PER_DAY;
        let courseId: string;
        let deckFilter;
        if ("deckId" in scope) {
          const deck = await getDeck(scope.deckId, now);
          if (!deck) return null;
          courseId = deck.course.id;
          deckFilter = eq(flashcards.deckId, scope.deckId);
        } else {
          if (!isId(scope.courseId)) return null;
          const [course] = await db
            .select({ id: courses.id })
            .from(courses)
            .where(and(eq(courses.id, scope.courseId), eq(courses.userId, userId)));
          if (!course) return null;
          courseId = course.id;
        }
        const courseDecks = db
          .select({ id: flashcardDecks.id })
          .from(flashcardDecks)
          .where(and(eq(flashcardDecks.courseId, courseId), eq(flashcardDecks.userId, userId)));
        const inScope = and(liveCard, deckFilter ?? inArray(flashcards.deckId, courseDecks));

        const due = await db
          .select()
          .from(flashcards)
          .where(and(inScope, ne(flashcards.state, "new"), lte(flashcards.due, now)))
          .orderBy(asc(flashcards.due));

        // New cards introduced today count against the limit for the whole course.
        const [introduced] = await db
          .select({ n: count() })
          .from(flashcardReviews)
          .innerJoin(
            flashcards,
            and(eq(flashcards.id, flashcardReviews.cardId), eq(flashcards.userId, userId)),
          )
          .where(
            and(
              eq(flashcardReviews.userId, userId),
              eq(flashcardReviews.stateBefore, "new"),
              gte(flashcardReviews.reviewedAt, dayStart),
              inArray(flashcards.deckId, courseDecks),
            ),
          );
        const newIntroducedToday = introduced?.n ?? 0;
        const newAvailable = Math.max(0, newPerDay - newIntroducedToday);
        const fresh =
          newAvailable > 0
            ? await db
                .select()
                .from(flashcards)
                .where(and(inScope, eq(flashcards.state, "new")))
                .orderBy(asc(flashcards.createdAt))
                .limit(newAvailable)
            : [];
        return { cards: [...due, ...fresh], due: due.length, newAvailable, newIntroducedToday };
      },

      /** Rates a card: reschedules it with FSRS and records the review. */
      async rate(
        cardId: string,
        rating: ReviewRating,
        options: { now?: Date; durationMs?: number } = {},
      ): Promise<{ card: Flashcard; review: FlashcardReview } | null> {
        const now = options.now ?? new Date();
        const card = await getCard(cardId);
        if (!card) return null;
        const next = scheduleReview(scheduleOf(card), rating, now);
        return db.transaction(async (tx) => {
          const [updated] = await tx
            .update(flashcards)
            .set({
              due: next.due,
              stability: next.stability,
              difficulty: next.difficulty,
              scheduledDays: next.scheduledDays,
              learningSteps: next.learningSteps,
              reps: next.reps,
              lapses: next.lapses,
              state: next.state,
              lastReview: next.lastReview,
            })
            .where(and(eq(flashcards.id, cardId), eq(flashcards.userId, userId)))
            .returning();
          const [logged] = await tx
            .insert(flashcardReviews)
            .values({
              userId,
              cardId,
              rating,
              reviewedAt: now,
              durationMs: Math.min(Math.max(Math.round(options.durationMs ?? 0), 0), 3_600_000),
              stateBefore: card.state,
              dueBefore: card.due,
              stateAfter: next.state,
              dueAfter: next.due,
              stabilityAfter: next.stability,
              difficultyAfter: next.difficulty,
              scheduledDaysAfter: next.scheduledDays,
            })
            .returning();
          return updated && logged ? { card: updated, review: logged } : null;
        });
      },

      /** A card's reviews, oldest first (kept even if the card is deleted). */
      async history(cardId: string): Promise<FlashcardReview[]> {
        if (!isId(cardId)) return [];
        return db
          .select()
          .from(flashcardReviews)
          .where(and(eq(flashcardReviews.cardId, cardId), eq(flashcardReviews.userId, userId)))
          .orderBy(asc(flashcardReviews.reviewedAt));
      },
    },
  };
}
