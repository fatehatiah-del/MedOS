import { MAX_CARD_TEXT, type UserScope } from "@medos/database";
import { REVIEW_RATINGS, intervalLabel, previewDue } from "@medos/fsrs";
import { CURRENT_SEMESTER } from "@medos/shared";
import { z } from "zod";

/*
 * Flashcard actions, kept apart from the Server Function wrappers so they can
 * be tested directly. Input from the browser is untrusted; whose data it is
 * comes only from the scope. Scheduling happens on the server. Nothing here
 * changes lecture completion, and nothing generates cards: the user writes
 * every card (a Study Guide passage only prefills the answer).
 */

export type ActionResult<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

export const MESSAGES = {
  notFound: "This deck or card could not be found.",
  invalid: "Write both sides of the card (each up to 5000 characters).",
  deckName: "Give the deck a name of up to 200 characters.",
  mismatch: "The selected text no longer matches the Study Guide. Reload the page and try again.",
  lecture: "This lecture could not be found.",
} as const;

const text = z.string().max(MAX_CARD_TEXT + 1000);
const cardInput = z.object({ deckId: z.uuid(), front: text, back: text });
const updateInput = z.object({ cardId: z.uuid(), front: text, back: text });
const cardIdInput = z.object({ cardId: z.uuid() });
const deckInput = z.object({ courseId: z.uuid(), name: z.string().max(300) });
const lectureInput = z.object({ lectureId: z.uuid() });
const fromGuideInput = z.object({
  resourceId: z.uuid(),
  sectionId: z.string().max(200).nullable(),
  unitPath: z.string().max(200),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  quote: z.string().max(5000),
  front: text,
  back: text,
});
const rateInput = z.object({
  cardId: z.uuid(),
  rating: z.enum(REVIEW_RATINGS),
  durationMs: z.number().min(0).max(86_400_000),
});

/**
 * Midnight today in `timeZone`, as an instant: the start of the day the
 * new-card limit counts from.
 */
export function startOfDay(now: Date, timeZone = CURRENT_SEMESTER.timeZone): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  const wall = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const offset = wall - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) - offset,
  );
}

/** "10 min", "3 d" for each rating: when the card would come back. */
export function ratingIntervals(
  card: Parameters<typeof previewDue>[0],
  now: Date,
): Record<(typeof REVIEW_RATINGS)[number], string> {
  const due = previewDue(card, now);
  return {
    again: intervalLabel(now, due.again),
    hard: intervalLabel(now, due.hard),
    good: intervalLabel(now, due.good),
    easy: intervalLabel(now, due.easy),
  };
}

export async function createCard(
  scope: UserScope,
  input: unknown,
): Promise<ActionResult<{ cardId: string }>> {
  const parsed = cardInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.invalid };
  const result = await scope.flashcards.cards.create(parsed.data.deckId, parsed.data);
  if (result.ok) return { ok: true, value: { cardId: result.card.id } };
  return { ok: false, error: result.reason === "not-found" ? MESSAGES.notFound : MESSAGES.invalid };
}

export async function updateCard(scope: UserScope, input: unknown): Promise<ActionResult> {
  const parsed = updateInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.invalid };
  const card = await scope.flashcards.cards.update(parsed.data.cardId, parsed.data);
  return card ? { ok: true, value: undefined } : { ok: false, error: MESSAGES.invalid };
}

export async function deleteCard(scope: UserScope, input: unknown): Promise<ActionResult> {
  const parsed = cardIdInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.notFound };
  return (await scope.flashcards.cards.remove(parsed.data.cardId))
    ? { ok: true, value: undefined }
    : { ok: false, error: MESSAGES.notFound };
}

export async function createDeck(
  scope: UserScope,
  input: unknown,
): Promise<ActionResult<{ deckId: string }>> {
  const parsed = deckInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.deckName };
  const deck = await scope.flashcards.decks.create(parsed.data.courseId, parsed.data.name);
  return deck ? { ok: true, value: { deckId: deck.id } } : { ok: false, error: MESSAGES.deckName };
}

export async function openLectureDeck(
  scope: UserScope,
  input: unknown,
): Promise<ActionResult<{ deckId: string }>> {
  const parsed = lectureInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.lecture };
  const deck = await scope.flashcards.decks.forLecture(parsed.data.lectureId);
  return deck ? { ok: true, value: { deckId: deck.id } } : { ok: false, error: MESSAGES.lecture };
}

export async function cardFromStudyGuide(
  scope: UserScope,
  input: unknown,
): Promise<ActionResult<{ cardId: string; deckName: string }>> {
  const parsed = fromGuideInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.invalid };
  const { resourceId, ...card } = parsed.data;
  const result = await scope.flashcards.cards.createFromStudyGuide(resourceId, card);
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === "text-mismatch"
          ? MESSAGES.mismatch
          : result.reason === "not-found"
            ? MESSAGES.notFound
            : MESSAGES.invalid,
    };
  }
  const deck = await scope.flashcards.decks.get(result.card.deckId);
  return {
    ok: true,
    value: { cardId: result.card.id, deckName: deck?.deck.name ?? "this lecture" },
  };
}

/** Rates a card; returns when it is due next and, if soon, the intervals to show again. */
export async function rateCard(
  scope: UserScope,
  input: unknown,
  now = new Date(),
): Promise<
  ActionResult<{
    due: string;
    state: string;
    intervals: Record<(typeof REVIEW_RATINGS)[number], string>;
  }>
> {
  const parsed = rateInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.notFound };
  const result = await scope.flashcards.review.rate(parsed.data.cardId, parsed.data.rating, {
    now,
    durationMs: parsed.data.durationMs,
  });
  if (!result) return { ok: false, error: MESSAGES.notFound };
  const { card } = result;
  return {
    ok: true,
    value: {
      due: card.due.toISOString(),
      state: card.state,
      intervals: ratingIntervals(
        {
          due: card.due,
          stability: card.stability,
          difficulty: card.difficulty,
          scheduledDays: card.scheduledDays,
          learningSteps: card.learningSteps,
          reps: card.reps,
          lapses: card.lapses,
          state: card.state,
          lastReview: card.lastReview,
        },
        card.due,
      ),
    },
  };
}
