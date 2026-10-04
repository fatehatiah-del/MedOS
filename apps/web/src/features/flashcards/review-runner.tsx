"use client";

import type { ReviewRating } from "@medos/fsrs";
import { Button, Progress, cn } from "@medos/ui";
import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";

import { rateFlashcard } from "./actions";

/*
 * A review session for one course (or one deck): the front of a card, then
 * the answer, then Again / Hard / Good / Easy. Each button shows when the
 * card would come back. A card due again within the session (Again on a
 * learning card, say) returns before the session ends.
 */

export interface ReviewCard {
  id: string;
  front: string;
  back: string;
  intervals: Record<ReviewRating, string>;
  source: { href: string } | null;
}

/** Cards due again within this many minutes come back in the same session. */
const REQUEUE_WITHIN_MS = 20 * 60_000;

const RATINGS: { rating: ReviewRating; label: string; tone: string }[] = [
  { rating: "again", label: "Again", tone: "border-danger/40" },
  { rating: "hard", label: "Hard", tone: "border-warning/40" },
  { rating: "good", label: "Good", tone: "border-accent/40" },
  { rating: "easy", label: "Easy", tone: "border-success/40" },
];

const elapsedSince = (start: number) => performance.now() - start;

export function ReviewRunner({
  cards: initial,
  doneHref,
}: {
  cards: readonly ReviewCard[];
  doneHref: string;
}) {
  const [queue, setQueue] = useState<ReviewCard[]>([...initial]);
  const [shown, setShown] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const shownAt = useRef(0);
  const card = queue[0];

  useEffect(() => {
    shownAt.current = performance.now();
  }, [card?.id, queue.length]);

  const rate = (rating: ReviewRating) => {
    if (!card || !shown || pending) return;
    const durationMs = elapsedSince(shownAt.current);
    startTransition(async () => {
      const result = await rateFlashcard({ cardId: card.id, rating, durationMs });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setReviewed((value) => value + 1);
      setShown(false);
      setQueue((previous) => {
        const rest = previous.slice(1);
        const comesBack = new Date(result.value.due).getTime() - Date.now() <= REQUEUE_WITHIN_MS;
        return comesBack ? [...rest, { ...card, intervals: result.value.intervals }] : rest;
      });
    });
  };

  const onKey = useEffectEvent((event: globalThis.KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if ((event.target as HTMLElement | null)?.closest?.("textarea, input, select, [role=dialog]"))
      return;
    if (!shown && (event.key === " " || event.key === "Enter")) {
      event.preventDefault();
      setShown(true);
      return;
    }
    const choice = RATINGS[Number(event.key) - 1];
    if (shown && choice) {
      event.preventDefault();
      rate(choice.rating);
    }
  });
  useEffect(() => {
    const listener = (event: globalThis.KeyboardEvent) => onKey(event);
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);

  if (!card) {
    return (
      <section
        aria-labelledby="review-done"
        className="space-y-3 rounded-xl border border-border bg-surface p-6"
      >
        <h2 id="review-done" className="font-serif text-[1.3rem] font-semibold text-fg">
          {reviewed > 0 ? "Done for now" : "Nothing to review"}
        </h2>
        <p className="text-sm text-fg-muted">
          {reviewed > 0
            ? `You reviewed ${reviewed} ${reviewed === 1 ? "card" : "cards"}. The rest come back when they are due.`
            : "No cards are due and no new cards remain for today."}
        </p>
        <Link href={doneHref} className="text-sm font-medium text-accent hover:underline">
          Back to decks
        </Link>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="space-y-2">
        <Progress
          value={reviewed}
          max={reviewed + queue.length}
          label="Cards reviewed this session"
          valueText={`${reviewed} reviewed, ${queue.length} to go`}
        />
        <p className="text-[13px] text-fg-muted">
          {reviewed} reviewed · {queue.length} to go
        </p>
      </div>

      <section
        aria-labelledby="card-front"
        className="space-y-5 rounded-xl border border-border bg-surface p-6"
      >
        <h2 id="card-front" className="sr-only">
          Card
        </h2>
        <p className="text-[18px] leading-relaxed whitespace-pre-wrap text-fg">{card.front}</p>
        {shown ? (
          <div className="space-y-4 border-t border-border pt-4" aria-live="polite">
            <p className="text-[16px] leading-relaxed whitespace-pre-wrap text-fg">{card.back}</p>
            {card.source ? (
              <Link href={card.source.href} className="text-[12.5px] text-accent hover:underline">
                Open the Study Guide passage
              </Link>
            ) : null}
            <div
              role="group"
              aria-label="Rate your recall"
              className="grid grid-cols-2 gap-2 @xl:grid-cols-4"
            >
              {RATINGS.map(({ rating, label, tone }, position) => (
                <button
                  key={rating}
                  type="button"
                  onClick={() => rate(rating)}
                  aria-disabled={pending || undefined}
                  aria-keyshortcuts={String(position + 1)}
                  className={cn(
                    "flex flex-col items-center rounded-lg border px-3 py-2 transition-colors duration-150 hover:bg-subtle",
                    tone,
                  )}
                >
                  <span className="text-[14.5px] font-semibold text-fg">
                    {label} <span className="font-normal text-fg-subtle">· {position + 1}</span>
                  </span>
                  <span className="text-[12px] text-fg-muted">{card.intervals[rating]}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <Button variant="primary" onClick={() => setShown(true)}>
            Show answer
          </Button>
        )}
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </section>
      <p className="text-[12.5px] text-fg-subtle">
        Keys: Space to show the answer, then 1–4 to rate.
      </p>
    </div>
  );
}
