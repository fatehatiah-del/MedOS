"use client";

import { Button, Progress } from "@medos/ui";
import { useRouter } from "next/navigation";
import { type KeyboardEvent, useEffect, useRef, useState, useTransition } from "react";

import { answerMcqQuestion, finishMcqSession } from "./actions";
import { FeedbackPanel, MarkWord, OptionLabel, QuestionStem, optionMark } from "./question";
import type { ClientQuestion, Feedback } from "./views";

/*
 * Learn mode: one question at a time. After each answer the server marks it
 * and sends the feedback (correct answer, explanation, why the others are
 * wrong, the source's reference). Answers are kept as they are given, so the
 * session can be left and resumed.
 */

export interface AnsweredQuestion {
  selected: number;
  feedback: Feedback;
}

export function LearnRunner({
  sessionId,
  resourceId,
  questions,
  answered: initiallyAnswered,
}: {
  sessionId: string;
  resourceId: string;
  questions: readonly ClientQuestion[];
  answered: Record<string, AnsweredQuestion>;
}) {
  const router = useRouter();
  const [answered, setAnswered] = useState(initiallyAnswered);
  const firstOpen = questions.findIndex((question) => !initiallyAnswered[question.key]);
  const [index, setIndex] = useState(firstOpen === -1 ? questions.length - 1 : firstOpen);
  const [choice, setChoice] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const shownAt = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);

  const question = questions[index];
  const result = question ? answered[question.key] : undefined;
  const done = Object.keys(answered).length;
  const correct = Object.values(answered).filter((entry) => entry.feedback.correct === true).length;

  useEffect(() => {
    shownAt.current = performance.now();
  }, [index]);

  if (!question) return null;

  const check = () => {
    if (choice === null || result || pending) return;
    const timeMs = performance.now() - shownAt.current;
    startTransition(async () => {
      const response = await answerMcqQuestion({
        sessionId,
        key: question.key,
        optionIndex: choice,
        timeMs,
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setError(null);
      setAnswered((previous) => ({ ...previous, [question.key]: response.value }));
    });
  };

  const go = (next: number) => {
    setIndex(next);
    setChoice(null);
    setError(null);
    window.requestAnimationFrame(() => heading.current?.focus());
  };

  const finish = () =>
    startTransition(async () => {
      const response = await finishMcqSession({ sessionId });
      if (response.ok) router.refresh();
      else setError(response.error);
    });

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if ((event.target as HTMLElement).closest("textarea, select, [role=dialog]")) return;
    const key = event.key.toUpperCase();
    const letter = question.options.findIndex((option) => option.label === key);
    const digit = /^[1-9]$/.test(key) ? Number(key) - 1 : -1;
    const pick = letter >= 0 ? letter : digit < question.options.length ? digit : -1;
    if (pick >= 0 && !result) {
      event.preventDefault();
      setChoice(pick);
    } else if (event.key === "Enter" && !(event.target as HTMLElement).closest("button")) {
      event.preventDefault();
      if (!result) check();
      else if (index < questions.length - 1) go(index + 1);
    }
  };

  const selected = result?.selected ?? choice;

  return (
    <div onKeyDown={onKeyDown} className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <Progress
          value={done}
          max={questions.length}
          label="Questions answered"
          valueText={`${done} of ${questions.length} answered`}
        />
        <p className="text-[13px] text-fg-muted">
          {done} of {questions.length} answered · {correct} correct
        </p>
      </div>

      <section
        aria-labelledby="mcq-question-heading"
        className="space-y-5 rounded-xl border border-border bg-surface p-5 sm:p-6"
      >
        <h2 id="mcq-question-heading" ref={heading} tabIndex={-1} className="sr-only">
          Question {index + 1} of {questions.length}
        </h2>
        <QuestionStem
          question={question}
          resourceId={resourceId}
          position={`Question ${index + 1} of ${questions.length}`}
        />
        <fieldset disabled={Boolean(result) || pending} className="space-y-2">
          <legend className="sr-only">Options</legend>
          {question.options.map((option, optionIndex) => {
            const mark = optionMark(optionIndex, selected, result?.feedback ?? null);
            return (
              <label
                key={option.label}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors duration-150 hover:bg-subtle/70 has-[:checked]:border-accent has-[:disabled]:cursor-default has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent"
              >
                <input
                  type="radio"
                  name={`q-${question.key}`}
                  value={optionIndex}
                  checked={selected === optionIndex}
                  onChange={() => setChoice(optionIndex)}
                  className="sr-only"
                />
                <OptionLabel
                  label={option.label}
                  text={option.text}
                  mark={mark}
                  suffix={<MarkWord mark={mark} selected={selected === optionIndex} />}
                />
              </label>
            );
          })}
        </fieldset>

        <div aria-live="polite">
          {result ? (
            <FeedbackPanel
              question={question}
              feedback={result.feedback}
              selected={result.selected}
              resourceId={resourceId}
            />
          ) : null}
          {error ? (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={() => go(index - 1)} disabled={index === 0}>
            Previous
          </Button>
          <div className="flex gap-2">
            {!result ? (
              <Button
                variant="primary"
                onClick={check}
                aria-disabled={choice === null || pending || undefined}
              >
                Check answer
              </Button>
            ) : index < questions.length - 1 ? (
              <Button variant="primary" onClick={() => go(index + 1)}>
                Next question
              </Button>
            ) : null}
            <Button variant="secondary" onClick={finish} aria-disabled={pending || undefined}>
              Finish session
            </Button>
          </div>
        </div>
      </section>
      <p className="text-[12.5px] text-fg-subtle">
        Keys: A–D or 1–4 to choose, Enter to check and to go on.
      </p>
    </div>
  );
}
