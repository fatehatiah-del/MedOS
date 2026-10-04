import { Badge, Notice, PageHeader, Section, Surface } from "@medos/ui";
import { Layers } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { NewDeck } from "@/features/flashcards/deck-manager";
import { deckHref, reviewHref } from "@/features/flashcards/load";
import { getWorkspace } from "@/server/workspace";

export const metadata: Metadata = { title: "Flashcards" };

/** Flashcards by course: what is due, what is new, and the decks. Review is per course. */
export default async function FlashcardsPage() {
  const { scope, semester } = await getWorkspace();
  const now = new Date();
  const [courses, decks] = await Promise.all([
    scope.courses.list(),
    scope.flashcards.decks.list(null, now),
  ]);
  const semesterCourses = courses.filter((course) => course.semesterId === semester.id);

  return (
    <div className="space-y-10">
      <PageHeader
        title="Flashcards"
        description="Spaced repetition with FSRS, organised by course and lecture."
        actions={
          <Badge tone={decks.length > 0 ? "accent" : "outline"}>
            {decks.reduce((sum, deck) => sum + deck.total, 0)} cards
          </Badge>
        }
      />

      <Notice icon={<Layers />} title="One course per session.">
        Review always stays within a single course. MedOS never mixes courses into one session.
      </Notice>

      {semesterCourses.map((course) => {
        const own = decks.filter((deck) => deck.course.id === course.id);
        const due = own.reduce((sum, deck) => sum + deck.due, 0);
        const fresh = own.reduce((sum, deck) => sum + deck.fresh, 0);
        const total = own.reduce((sum, deck) => sum + deck.total, 0);
        return (
          <Section key={course.id} title={course.name}>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-fg-muted">
                <span className="font-medium text-fg tabular-nums">{due}</span> due ·{" "}
                <span className="tabular-nums">{fresh}</span> new ·{" "}
                <span className="tabular-nums">{total}</span> cards
              </p>
              {total > 0 ? (
                <Link
                  href={reviewHref(course.slug)}
                  className="inline-flex h-8 items-center rounded-lg bg-accent px-3 text-[13px] font-medium text-accent-fg hover:bg-accent-hover"
                  aria-label={`Review ${course.name}`}
                >
                  Review {course.shortName}
                </Link>
              ) : null}
            </div>
            {own.length > 0 ? (
              <ul className="grid gap-2 @2xl:grid-cols-2">
                {own.map((deck) => (
                  <li key={deck.deck.id}>
                    <Link href={deckHref(course.slug, deck.deck.id)} className="block">
                      <Surface
                        padding="md"
                        className="space-y-1 transition-colors duration-150 hover:bg-subtle/60"
                      >
                        <span className="block text-[15px] font-medium text-fg">
                          {deck.deck.name}
                        </span>
                        <span className="block text-[13px] text-fg-muted">
                          {deck.total} cards · {deck.due} due · {deck.fresh} new
                          {deck.lecture ? " · lecture deck" : ""}
                        </span>
                      </Surface>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-fg-subtle">
                No decks yet. Open a lecture to start its deck, select Study Guide text and choose
                Create flashcard, or make a course deck.
              </p>
            )}
            <NewDeck courseId={course.id} courseName={course.shortName} />
          </Section>
        );
      })}
    </div>
  );
}
