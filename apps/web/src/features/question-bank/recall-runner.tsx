"use client";

import type { RecallRating } from "@medos/database";
import { Button, Progress, cn } from "@medos/ui";
import { useRouter } from "next/navigation";
import {
  type KeyboardEvent,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useTransition,
} from "react";

import { ReviewLaterToggle } from "@/features/review/review-later-toggle";
import { Blocks, InlineContent } from "@/features/study-guide/content";

import { rateRecall, revealQuestion } from "./actions";
import { type ClientItem, RATINGS, type RevealedAnswer } from "./recall";

/*
 * Active recall, one question at a time: think (or type) an answer, reveal the
 * source's model answer, then rate how well you recalled it. Typing is
 * optional. The answer is fetched from the server only on Reveal, which
 * records the attempt.
 */

/** Milliseconds since `start` (a performance.now() reading). */
const elapsedSince = (start: number) => performance.now() - start;

interface Revealed {
  attemptId: string;
  answer: RevealedAnswer;
  typed: string;
}

export function RecallRunner({
  resourceId,
  items,
  reviewLater,
}: {
  resourceId: string;
  /** In practice order. */
  items: readonly ClientItem[];
  /** Keys of the questions marked Review Later. */
  reviewLater: readonly string[];
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [showChoices, setShowChoices] = useState(false);
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [ratings, setRatings] = useState<Record<string, RecallRating>>({});
  const [marked, setMarked] = useState(() => new Set(reviewLater));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const shownAt = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const answerHeading = useRef<HTMLHeadingElement>(null);

  const item = items[index];
  const done = Object.keys(ratings).length;

  useEffect(() => {
    shownAt.current = performance.now();
  }, [index]);

  const reveal = () => {
    if (!item || revealed || pending) return;
    const timeMs = elapsedSince(shownAt.current);
    startTransition(async () => {
      const result = await revealQuestion({
        resourceId,
        key: item.key,
        typedAnswer: typed.trim() ? typed : null,
        timeMs,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setRevealed({ ...result.value, typed: typed.trim() });
      window.requestAnimationFrame(() => answerHeading.current?.focus());
    });
  };

  const rate = (rating: RecallRating) => {
    if (!item || !revealed || pending) return;
    startTransition(async () => {
      const result = await rateRecall({ attemptId: revealed.attemptId, rating });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRatings((previous) => ({ ...previous, [item.key]: rating }));
      setIndex(index + 1);
      setTyped("");
      setShowChoices(false);
      setRevealed(null);
      setError(null);
      window.requestAnimationFrame(() => heading.current?.focus());
    });
  };

  // Rating keys work wherever focus is once the answer is shown.
  const onRatingKey = useEffectEvent((event: globalThis.KeyboardEvent) => {
    if (!revealed || event.ctrlKey || event.metaKey || event.altKey) return;
    if ((event.target as HTMLElement | null)?.closest?.("textarea, input, select, [role=dialog]"))
      return;
    const choice = RATINGS[Number(event.key) - 1];
    if (choice) {
      event.preventDefault();
      rate(choice.rating);
    }
  });
  useEffect(() => {
    const listener = (event: globalThis.KeyboardEvent) => onRatingKey(event);
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);

  if (items.length === 0) {
    return <p className="text-sm text-fg-muted">This question bank has no questions.</p>;
  }

  if (!item) {
    const counts = RATINGS.map(({ rating, label }) => ({
      label,
      count: Object.values(ratings).filter((value) => value === rating).length,
    }));
    return (
      <section
        aria-labelledby="recall-done"
        className="space-y-4 rounded-xl border border-border bg-surface p-6"
      >
        <h2 id="recall-done" className="font-serif text-[1.3rem] font-semibold text-fg">
          Session finished
        </h2>
        <p className="text-sm text-fg-muted">
          You rated {done} of {items.length} questions.
        </p>
        <ul className="flex flex-wrap gap-2">
          {counts.map(({ label, count }) => (
            <li key={label} className="rounded-lg border border-border px-3 py-2 text-sm text-fg">
              {label}: <span className="font-semibold tabular-nums">{count}</span>
            </li>
          ))}
        </ul>
        <Button variant="primary" onClick={() => router.refresh()}>
          Practise again
        </Button>
      </section>
    );
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (revealed) return;
    const inText = (event.target as HTMLElement).closest("textarea");
    // Ctrl+Enter reveals from the answer box; Enter reveals elsewhere.
    if (event.key === "Enter" && (!inText || event.ctrlKey || event.metaKey)) {
      if (!(event.target as HTMLElement).closest("button")) {
        event.preventDefault();
        reveal();
      }
    }
  };

  const context = {
    resourceId,
    marks: new Map(),
    sectionId: null,
    sectionLabel: "the question",
  };
  const answer = revealed?.answer;

  return (
    <div onKeyDown={onKeyDown} className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <Progress
          value={done}
          max={items.length}
          label="Questions rated this session"
          valueText={`${done} of ${items.length} rated`}
        />
        <p className="text-[13px] text-fg-muted">
          {done} of {items.length} rated this session
        </p>
      </div>

      <section
        aria-labelledby="recall-question"
        className="space-y-5 rounded-xl border border-border bg-surface p-5 sm:p-6"
      >
        <h2
          id="recall-question"
          ref={heading}
          tabIndex={-1}
          className="text-[13px] font-semibold text-fg-muted focus:outline-none"
        >
          Question {item.number ?? index + 1}
          <span className="font-normal text-fg-subtle">
            {" "}
            · {index + 1} of {items.length} in this session
          </span>
        </h2>
        <div className="text-[16px] leading-[1.65] text-fg">
          <Blocks blocks={item.prompt} parent={null} context={context} compact />
        </div>

        {item.choices.length > 0 ? (
          showChoices || revealed ? (
            <ul className="space-y-1.5" aria-label="Options">
              {item.choices.map((choice) => (
                <li
                  key={choice.label}
                  className={cn(
                    "flex gap-3 rounded-lg border px-3 py-2 text-[15px] leading-relaxed text-fg",
                    answer?.status === "paired" && answer.correctLabel === choice.label
                      ? "border-success/40 bg-success-soft/60"
                      : "border-border",
                  )}
                >
                  <span className="font-semibold text-fg-muted">{choice.label}</span>
                  <span>
                    <InlineContent inlines={choice.text} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setShowChoices(true)}>
              Show options ({item.choices.length})
            </Button>
          )
        ) : null}

        {!revealed ? (
          <div className="space-y-2">
            <label htmlFor="recall-answer" className="block text-sm font-medium text-fg">
              Your answer <span className="font-normal text-fg-subtle">(optional)</span>
            </label>
            <textarea
              id="recall-answer"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              rows={4}
              aria-describedby="recall-answer-hint"
              className="block w-full resize-y rounded-lg border border-border-strong bg-surface px-3 py-2 text-[15px] leading-relaxed text-fg focus:border-accent focus:outline-none"
            />
            <p id="recall-answer-hint" className="text-[12.5px] text-fg-subtle">
              Think it through, or type it. Ctrl+Enter reveals from here.
            </p>
            <Button variant="primary" onClick={reveal} aria-disabled={pending || undefined}>
              Reveal answer
            </Button>
          </div>
        ) : (
          <div className="space-y-5" aria-live="polite">
            <div className="space-y-2">
              <h3
                ref={answerHeading}
                tabIndex={-1}
                className="text-[12px] font-semibold tracking-wide text-fg-subtle uppercase focus:outline-none"
              >
                Model answer
              </h3>
              {answer?.status === "paired" ? (
                <div className="space-y-3 rounded-lg border border-success/30 bg-success-soft/40 px-4 py-3 text-[15px] leading-relaxed text-fg">
                  {/* The source states the answer itself; the correct option is highlighted above. */}
                  <Blocks blocks={answer.blocks} parent={null} context={context} compact />
                  {answer.choiceNotes.length > 0 ? (
                    <ul className="space-y-1 border-t border-success/20 pt-2 text-[14px]">
                      {answer.choiceNotes.map((note) => (
                        <li key={note.label} className="flex gap-2">
                          <span className="font-semibold text-fg-muted">{note.label}</span>
                          <span>
                            <InlineContent inlines={note.text} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : (
                <p className="rounded-lg bg-subtle px-4 py-3 text-sm text-fg-muted">
                  The source gives no model answer for this question: {answer?.reason}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <h3 className="text-[12px] font-semibold tracking-wide text-fg-subtle uppercase">
                Your answer
              </h3>
              <p className="rounded-lg border border-border px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap text-fg">
                {revealed.typed || (
                  <span className="text-fg-subtle">You answered in your head.</span>
                )}
              </p>
            </div>
            <ReviewLaterToggle
              key={item.key}
              resourceId={resourceId}
              questionKey={item.key}
              initiallyMarked={marked.has(item.key)}
              onChange={(on) =>
                setMarked((current) => {
                  const next = new Set(current);
                  if (on) next.add(item.key);
                  else next.delete(item.key);
                  return next;
                })
              }
            />
            <div role="group" aria-labelledby="recall-rate" className="space-y-2">
              <h3 id="recall-rate" className="text-sm font-semibold text-fg">
                How well did you recall it?
              </h3>
              <div className="grid grid-cols-2 gap-2 @xl:grid-cols-4">
                {RATINGS.map(({ rating, label, hint }, position) => (
                  <button
                    key={rating}
                    type="button"
                    onClick={() => rate(rating)}
                    aria-disabled={pending || undefined}
                    aria-keyshortcuts={String(position + 1)}
                    className={cn(
                      "flex flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors duration-150 hover:bg-subtle",
                      rating === "again" && "border-danger/40",
                      rating === "hard" && "border-warning/40",
                      rating === "good" && "border-accent/40",
                      rating === "easy" && "border-success/40",
                    )}
                  >
                    <span className="text-[14.5px] font-semibold text-fg">
                      {label} <span className="font-normal text-fg-subtle">· {position + 1}</span>
                    </span>
                    <span className="text-[12px] text-fg-muted">{hint}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </section>
      <p className="text-[12.5px] text-fg-subtle">
        Keys: Enter to reveal, then 1–4 to rate. Your ratings and answers are kept.
      </p>
    </div>
  );
}
