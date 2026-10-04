import "server-only";

import type { Flashcard, UserScope } from "@medos/database";
import { intervalLabel } from "@medos/fsrs";

import { studyGuideHref } from "@/features/courses/progress";

import type { DeckCard } from "./deck-manager";
import { ratingIntervals } from "./logic";
import type { ReviewCard } from "./review-runner";

/*
 * Server-side helpers shared by the flashcard pages: course lookup by slug,
 * the address of a card's Study Guide passage, and how cards are shown.
 */

export const flashcardsHref = "/flashcards";
export const deckHref = (courseSlug: string, deckId: string) =>
  `/flashcards/${courseSlug}/decks/${deckId}`;
export const reviewHref = (courseSlug: string, deckId?: string) =>
  `/flashcards/${courseSlug}/review${deckId ? `?deck=${deckId}` : ""}`;

export async function courseBySlug(scope: UserScope, semesterId: string, slug: string) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null;
  return scope.courses.getBySlug(semesterId, slug);
}

/** Where a card made from a Study Guide came from, as a reader address. */
export async function sourceHrefs(
  scope: UserScope,
  courseSlug: string,
  cards: readonly Flashcard[],
): Promise<Map<string, string>> {
  const hrefs = new Map<string, string>();
  const lectureOf = new Map<string, string | null>();
  for (const card of cards) {
    if (!card.sourceResourceId) continue;
    if (!lectureOf.has(card.sourceResourceId)) {
      lectureOf.set(
        card.sourceResourceId,
        (await scope.resources.get(card.sourceResourceId))?.lectureId ?? null,
      );
    }
    const lectureId = lectureOf.get(card.sourceResourceId);
    if (!lectureId) continue;
    const anchor = card.sourceSectionId ? `#${card.sourceSectionId}` : "";
    hrefs.set(card.id, `${studyGuideHref(courseSlug, lectureId, card.sourceResourceId)}${anchor}`);
  }
  return hrefs;
}

function dueLabel(card: Flashcard, now: Date): string {
  if (card.state === "new") return "New";
  if (card.due.getTime() <= now.getTime()) return "Due now";
  return `Due in ${intervalLabel(now, card.due)}`;
}

export function toDeckCard(card: Flashcard, now: Date, href: string | undefined): DeckCard {
  return {
    id: card.id,
    front: card.front,
    back: card.back,
    origin: card.origin,
    source: href && card.sourceQuote ? { href, quote: card.sourceQuote } : null,
    dueLabel: dueLabel(card, now),
  };
}

export function toReviewCard(card: Flashcard, now: Date, href: string | undefined): ReviewCard {
  return {
    id: card.id,
    front: card.front,
    back: card.back,
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
      now,
    ),
    source: href ? { href } : null,
  };
}
