import { PageHeader } from "@medos/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { startOfDay } from "@/features/flashcards/logic";
import {
  courseBySlug,
  flashcardsHref,
  sourceHrefs,
  toReviewCard,
} from "@/features/flashcards/load";
import { ReviewRunner } from "@/features/flashcards/review-runner";
import { getWorkspace } from "@/server/workspace";

interface ReviewPageProps {
  params: Promise<{ courseSlug: string }>;
  searchParams: Promise<{ deck?: string | string[] }>;
}

export const metadata: Metadata = { title: "Review flashcards" };

/**
 * A review session for one course, or one deck of it (`?deck=`). Never more
 * than one course: a deck of another course is "not found".
 */
export default async function ReviewPage({ params, searchParams }: ReviewPageProps) {
  const [{ courseSlug }, query] = await Promise.all([params, searchParams]);
  const { scope, semester } = await getWorkspace();
  const course = await courseBySlug(scope, semester.id, courseSlug);
  if (!course) notFound();
  const deckId = Array.isArray(query.deck) ? query.deck[0] : query.deck;

  let deckName: string | null = null;
  if (deckId) {
    const deck = await scope.flashcards.decks.get(deckId);
    if (!deck || deck.course.id !== course.id) notFound();
    deckName = deck.deck.name;
  }

  const now = new Date();
  const queue = await scope.flashcards.review.queue(deckId ? { deckId } : { courseId: course.id }, {
    now,
    dayStart: startOfDay(now),
  });
  if (!queue) notFound();
  const hrefs = await sourceHrefs(scope, course.slug, queue.cards);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Breadcrumbs
          items={[
            { label: "Flashcards", href: flashcardsHref },
            { label: course.shortName },
            { label: "Review" },
          ]}
        />
        <PageHeader
          eyebrow={course.name}
          title={deckName ? `Review: ${deckName}` : `Review ${course.shortName}`}
          description={`${queue.due} due · ${Math.min(queue.newAvailable, queue.cards.length - queue.due)} new today (${queue.newIntroducedToday} already introduced)`}
        />
      </div>
      <ReviewRunner
        cards={queue.cards.map((card) => toReviewCard(card, now, hrefs.get(card.id)))}
        doneHref={flashcardsHref}
      />
    </div>
  );
}
