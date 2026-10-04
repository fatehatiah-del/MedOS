"use client";

import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, cn } from "@medos/ui";
import { Flag, Timer } from "lucide-react";
import { useRouter } from "next/navigation";
import { type KeyboardEvent, useCallback, useEffect, useRef, useState, useTransition } from "react";

import { finishMcqSession, saveMcqAnswer } from "./actions";
import { OptionLabel, QuestionStem, optionMark } from "./question";
import type { ClientQuestion } from "./views";

/*
 * Exam and USMLE modes: no feedback until the exam is submitted. Answers,
 * flags and time per question are saved to the server as the user works, so
 * a reload or a crash loses nothing. The timer counts down from the server's
 * clock; when it reaches zero the exam is submitted.
 */

export interface ExamDraft {
  answers: Record<string, number>;
  flagged: string[];
  timeMs: Record<string, number>;
}

function clock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const rest = safe % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}

export function ExamRunner({
  sessionId,
  resourceId,
  modeLabel,
  questions,
  draft,
  startedAt,
  timeLimitSeconds,
  serverNow,
}: {
  sessionId: string;
  resourceId: string;
  modeLabel: string;
  questions: readonly ClientQuestion[];
  draft: ExamDraft;
  startedAt: string;
  timeLimitSeconds: number | null;
  /** The server's clock when the page was rendered, to correct the browser's. */
  serverNow: string;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(() => {
    const open = questions.findIndex((question) => draft.answers[question.key] === undefined);
    return open === -1 ? 0 : open;
  });
  const [answers, setAnswers] = useState<Record<string, number>>(draft.answers);
  const [flagged, setFlagged] = useState<Set<string>>(new Set(draft.flagged));
  const timeMs = useRef<Record<string, number>>({ ...draft.timeMs });
  const shownAt = useRef(0);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [confirming, setConfirming] = useState(false);
  const [submitting, startSubmit] = useTransition();
  const [remaining, setRemaining] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const submitted = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);

  const question = questions[index];
  const skew = useRef(0);

  /** Adds the time spent on the current question since it was shown. */
  const takeTime = useCallback((key: string) => {
    const now = performance.now();
    if (shownAt.current > 0 && document.visibilityState === "visible") {
      timeMs.current[key] = (timeMs.current[key] ?? 0) + (now - shownAt.current);
    }
    shownAt.current = now;
    return Math.round(timeMs.current[key] ?? 0);
  }, []);

  // Saves are sent one at a time, in the order they were made: each carries
  // the question's whole state, so a later save must never be overtaken.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  // "Saved" only once every queued save has been stored.
  const outstanding = useRef(0);
  const failed = useRef(false);
  const save = useCallback(
    (key: string, optionIndex: number | null, isFlagged: boolean) => {
      outstanding.current += 1;
      setSaveState("saving");
      const timeSpent = takeTime(key);
      const settle = (ok: boolean) => {
        outstanding.current -= 1;
        if (!ok) failed.current = true;
        if (outstanding.current === 0) {
          setSaveState(failed.current ? "error" : "saved");
          failed.current = false;
        }
      };
      const next = queue.current.then(async () => {
        try {
          const result = await saveMcqAnswer({
            sessionId,
            key,
            optionIndex,
            flagged: isFlagged,
            timeMs: timeSpent,
          });
          settle(result.ok);
          return result.ok && !result.value.expired;
        } catch {
          settle(false);
          return false;
        }
      });
      queue.current = next;
      return next;
    },
    [sessionId, takeTime],
  );

  const submit = useCallback(() => {
    if (submitted.current) return;
    submitted.current = true;
    startSubmit(async () => {
      const current = questions[index];
      if (current) {
        await save(current.key, answers[current.key] ?? null, flagged.has(current.key));
      }
      const result = await finishMcqSession({ sessionId });
      if (result.ok) router.refresh();
      else {
        submitted.current = false;
        setAnnouncement(result.error);
      }
    });
  }, [answers, flagged, index, questions, router, save, sessionId]);

  // The timer, from the server's clock.
  useEffect(() => {
    if (timeLimitSeconds === null) return;
    skew.current = new Date(serverNow).getTime() - Date.now();
    const deadline = new Date(startedAt).getTime() + timeLimitSeconds * 1000;
    const tick = () => {
      const left = (deadline - (Date.now() + skew.current)) / 1000;
      setRemaining(left);
      if (left <= 0) submit();
      if (Math.round(left) === 300) setAnnouncement("Five minutes left.");
      if (Math.round(left) === 60) setAnnouncement("One minute left.");
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [serverNow, startedAt, submit, timeLimitSeconds]);

  useEffect(() => {
    shownAt.current = performance.now();
  }, [index]);

  if (!question) return null;

  const choose = (optionIndex: number) => {
    setAnswers((previous) => ({ ...previous, [question.key]: optionIndex }));
    void save(question.key, optionIndex, flagged.has(question.key));
  };

  const toggleFlag = () => {
    const next = new Set(flagged);
    if (next.has(question.key)) next.delete(question.key);
    else next.add(question.key);
    setFlagged(next);
    void save(question.key, answers[question.key] ?? null, next.has(question.key));
  };

  const go = (next: number) => {
    if (next < 0 || next >= questions.length || next === index) return;
    // Record the time on the question being left.
    void save(question.key, answers[question.key] ?? null, flagged.has(question.key));
    setIndex(next);
    window.requestAnimationFrame(() => heading.current?.focus());
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey || confirming) return;
    const key = event.key.toUpperCase();
    const letter = question.options.findIndex((option) => option.label === key);
    const digit = /^[1-9]$/.test(key) ? Number(key) - 1 : -1;
    const pick = letter >= 0 ? letter : digit < question.options.length ? digit : -1;
    if (pick >= 0) {
      event.preventDefault();
      choose(pick);
    } else if (key === "F") {
      event.preventDefault();
      toggleFlag();
    } else if (event.key === "ArrowRight" && !(event.target as HTMLElement).closest("input")) {
      event.preventDefault();
      go(index + 1);
    } else if (event.key === "ArrowLeft" && !(event.target as HTMLElement).closest("input")) {
      event.preventDefault();
      go(index - 1);
    }
  };

  const answeredCount = questions.filter((entry) => answers[entry.key] !== undefined).length;
  const unanswered = questions.length - answeredCount;
  const low = remaining !== null && remaining <= 60;

  return (
    <div onKeyDown={onKeyDown} className="grid gap-6 @min-[56rem]:grid-cols-[minmax(0,1fr)_15rem]">
      <section
        aria-labelledby="exam-question-heading"
        className="min-w-0 space-y-5 rounded-xl border border-border bg-surface p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            id="exam-question-heading"
            ref={heading}
            tabIndex={-1}
            className="text-[13px] font-semibold text-fg-muted focus:outline-none"
          >
            {modeLabel} · Question {index + 1} of {questions.length}
          </h2>
          <div className="flex items-center gap-3 text-[13px]">
            <span className="text-fg-subtle" aria-live="off">
              {saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved" : "Saved"}
            </span>
            {remaining !== null ? (
              <span
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2 py-1 font-semibold tabular-nums",
                  low ? "bg-danger-soft text-danger" : "bg-subtle text-fg",
                )}
              >
                <Timer aria-hidden="true" className="size-4" />
                <span className="sr-only">Time left: </span>
                {clock(remaining)}
              </span>
            ) : (
              <span className="text-fg-subtle">Untimed</span>
            )}
          </div>
        </div>

        <QuestionStem
          question={question}
          resourceId={resourceId}
          position={`Question ${index + 1} of ${questions.length}`}
        />

        <fieldset disabled={submitting} className="space-y-2">
          <legend className="sr-only">Options</legend>
          {question.options.map((option, optionIndex) => (
            <label
              key={option.label}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors duration-150 hover:bg-subtle/70 has-[:checked]:border-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent"
            >
              <input
                type="radio"
                name={`exam-${question.key}`}
                value={optionIndex}
                checked={answers[question.key] === optionIndex}
                onChange={() => choose(optionIndex)}
                className="sr-only"
              />
              <OptionLabel
                label={option.label}
                text={option.text}
                mark={optionMark(optionIndex, answers[question.key] ?? null, null)}
              />
            </label>
          ))}
        </fieldset>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => go(index - 1)} disabled={index === 0}>
              Previous
            </Button>
            <Button
              variant="secondary"
              onClick={toggleFlag}
              aria-pressed={flagged.has(question.key)}
              className="aria-pressed:border-warning aria-pressed:text-warning"
            >
              <Flag aria-hidden="true" />
              {flagged.has(question.key) ? "Flagged" : "Flag"}
            </Button>
          </div>
          <div className="flex gap-2">
            {index < questions.length - 1 ? (
              <Button variant="secondary" onClick={() => go(index + 1)}>
                Next
              </Button>
            ) : null}
            <Button
              variant="primary"
              onClick={() => setConfirming(true)}
              aria-disabled={submitting || undefined}
            >
              Submit exam
            </Button>
          </div>
        </div>
        <p className="text-[12.5px] text-fg-subtle">
          Keys: A–D or 1–4 to choose, F to flag, ← → to move between questions.
        </p>
      </section>

      <nav
        aria-label="Question navigator"
        className="space-y-3 @min-[56rem]:sticky @min-[56rem]:top-20 @min-[56rem]:self-start"
      >
        <p className="text-[13px] text-fg-muted">
          {answeredCount} of {questions.length} answered · {flagged.size} flagged
        </p>
        <ol className="grid grid-cols-6 gap-1.5 @min-[56rem]:grid-cols-5">
          {questions.map((entry, position) => {
            const isAnswered = answers[entry.key] !== undefined;
            const isFlagged = flagged.has(entry.key);
            const state = [isAnswered ? "answered" : "unanswered", isFlagged ? "flagged" : null]
              .filter(Boolean)
              .join(", ");
            return (
              <li key={entry.key}>
                <button
                  type="button"
                  onClick={() => go(position)}
                  aria-current={position === index ? "step" : undefined}
                  aria-label={`Question ${position + 1}, ${state}`}
                  className={cn(
                    "relative flex h-9 w-full items-center justify-center rounded-md border text-[13px] font-medium tabular-nums transition-colors duration-150",
                    isAnswered
                      ? "border-accent/40 bg-accent-soft text-accent"
                      : "border-border bg-surface text-fg-muted hover:bg-subtle",
                    position === index && "ring-2 ring-accent",
                  )}
                >
                  {position + 1}
                  {isFlagged ? (
                    <Flag
                      aria-hidden="true"
                      className="absolute -top-1 -right-1 size-3.5 fill-warning text-warning"
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>
        <p className="text-[12px] leading-relaxed text-fg-subtle">
          Answers are saved as you go. No answers are shown until you submit.
        </p>
      </nav>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogTitle>Submit the exam?</DialogTitle>
          <DialogDescription>
            {unanswered > 0
              ? `${unanswered} ${unanswered === 1 ? "question is" : "questions are"} unanswered and will count as not correct.`
              : "All questions are answered."}{" "}
            {flagged.size > 0 ? `${flagged.size} flagged.` : null} You cannot change answers
            afterwards.
          </DialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Keep working
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setConfirming(false);
                submit();
              }}
            >
              Submit
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
