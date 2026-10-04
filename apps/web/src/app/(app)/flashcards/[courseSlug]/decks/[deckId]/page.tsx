import { PageHeader, Section } from "@medos/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { AIAction } from "@/features/ai/ai-action";
import { lectureHref } from "@/features/courses/progress";
import { AddCard, CardList } from "@/features/flashcards/deck-manager";
import {
  courseBySlug,
  flashcardsHref,
  reviewHref,
  sourceHrefs,
  toDeckCard,
} from "@/features/flashcards/load";
import { aiConfigured } from "@/server/ai";
import { getWorkspace } from "@/server/workspace";

interface DeckPageProps {
  params: Promise<{ courseSlug: string; deckId: string }>;
}

/** The user's deck in that course, or "not found" for anything else. */
async function loadDeck(courseSlug: string, deckId: string) {
  const { scope, semester } = await getWorkspace();
  const course = await courseBySlug(scope, semester.id, courseSlug);
  if (!course) notFound();
  const deck = await scope.flashcards.decks.get(deckId);
  if (!deck || deck.course.id !== course.id) notFound();
  return { scope, course, deck };
}

export async function generateMetadata({ params }: DeckPageProps): Promise<Metadata> {
  const { courseSlug, deckId } = await params;
  const { deck, course } = await loadDeck(courseSlug, deckId);
  return { title: `${deck.deck.name} · ${course.shortName} flashcards` };
}

export default async function DeckPage({ params }: DeckPageProps) {
  const { courseSlug, deckId } = await params;
  const { scope, course, deck } = await loadDeck(courseSlug, deckId);
  const now = new Date();
  const cards = await scope.flashcards.cards.list(deckId);
  const hrefs = await sourceHrefs(scope, course.slug, cards);

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Breadcrumbs
          items={[
            { label: "Flashcards", href: flashcardsHref },
            { label: course.shortName },
            { label: deck.deck.name },
          ]}
        />
        <PageHeader
          eyebrow={course.name}
          title={deck.deck.name}
          description={`${deck.total} cards · ${deck.due} due · ${deck.fresh} new`}
          actions={
            deck.total > 0 ? (
              <Link
                href={reviewHref(course.slug, deck.deck.id)}
                className="inline-flex h-9 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-accent-hover"
              >
                Review this deck
              </Link>
            ) : null
          }
        />
        {deck.lecture ? (
          <p className="text-[13px] text-fg-muted">
            The deck of{" "}
            <Link
              href={lectureHref(course.slug, deck.lecture.id)}
              className="text-accent hover:underline"
            >
              Week {deck.lecture.weekNumber} · {deck.lecture.title}
            </Link>
            .
          </p>
        ) : null}
      </div>

      <Section title="Add a card">
        <AddCard deckId={deck.deck.id} />
        <AIAction
          feature="generate-flashcards"
          configured={aiConfigured()}
          context={{ deckId: deck.deck.id }}
        />
      </Section>

      <Section title={`Cards (${cards.length})`}>
        <CardList cards={cards.map((card) => toDeckCard(card, now, hrefs.get(card.id)))} />
      </Section>
    </div>
  );
}
