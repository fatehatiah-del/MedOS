"use client";

import type { McqMode } from "@medos/database";
import { Button, cn } from "@medos/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";

import { startMcqSession } from "./actions";
import { DEFAULT_SECONDS_PER_QUESTION } from "./selection";

/*
 * Choosing how to practise: the mode, optionally a topic and a number of
 * questions, shuffling for exams, and the time limit.
 */

const MODES: { mode: McqMode; title: string; description: string }[] = [
  {
    mode: "learn",
    title: "Learn",
    description: "One question at a time, with the answer and explanation after each.",
  },
  {
    mode: "exam",
    title: "Exam",
    description: "Timed, with a navigator and flags. Results only after you submit.",
  },
  {
    mode: "usmle",
    title: "USMLE",
    description:
      "Exam conditions, using only vignette, mechanism, consequence and application questions.",
  },
];

export function StartForm({
  resourceId,
  total,
  usmleCount,
  topics,
  sessionHref,
}: {
  resourceId: string;
  total: number;
  usmleCount: number;
  topics: { topic: string; count: number }[];
  /** The address of a session, from its id. */
  sessionHref: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<McqMode>("learn");
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState("all");
  const [shuffle, setShuffle] = useState(false);
  const [timing, setTiming] = useState<"default" | "untimed" | "custom">("default");
  const [minutes, setMinutes] = useState("30");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const available = mode === "usmle" ? usmleCount : total;
  const exam = mode !== "learn";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    startTransition(async () => {
      const result = await startMcqSession({
        resourceId,
        mode,
        topic: topic || null,
        count: count === "all" ? null : Number(count),
        shuffle: exam && shuffle,
        timing,
        minutes: timing === "custom" ? Number(minutes) || null : null,
      });
      if (result.ok) router.push(sessionHref.replace("SESSION", result.value.sessionId));
      else setError(result.error);
    });
  };

  return (
    <form
      onSubmit={submit}
      className="space-y-6"
      aria-describedby={error ? "mcq-start-error" : undefined}
    >
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold text-fg">Mode</legend>
        <div className="grid gap-2 @xl:grid-cols-3">
          {MODES.map((option) => (
            <label
              key={option.mode}
              className={cn(
                "flex cursor-pointer flex-col gap-1 rounded-xl border p-4 transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent",
                mode === option.mode
                  ? "border-accent bg-accent-soft/60"
                  : "border-border bg-surface hover:bg-subtle/60",
              )}
            >
              <input
                type="radio"
                name="mode"
                value={option.mode}
                checked={mode === option.mode}
                onChange={() => setMode(option.mode)}
                className="sr-only"
              />
              <span className="text-[15px] font-semibold text-fg">{option.title}</span>
              <span className="text-[13px] leading-relaxed text-fg-muted">
                {option.description}
              </span>
              <span className="text-[12px] text-fg-subtle">
                {option.mode === "usmle" ? `${usmleCount} questions` : `${total} questions`}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 @xl:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="mcq-topic" className="block text-sm font-medium text-fg">
            Topic
          </label>
          <select
            id="mcq-topic"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            className="h-9 w-full rounded-lg border border-border-strong bg-surface px-2 text-sm text-fg focus:border-accent focus:outline-none"
          >
            <option value="">All topics</option>
            {topics.map((entry) => (
              <option key={entry.topic} value={entry.topic}>
                {entry.topic} ({entry.count})
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="mcq-count" className="block text-sm font-medium text-fg">
            Questions
          </label>
          <select
            id="mcq-count"
            value={count}
            onChange={(event) => setCount(event.target.value)}
            className="h-9 w-full rounded-lg border border-border-strong bg-surface px-2 text-sm text-fg focus:border-accent focus:outline-none"
          >
            <option value="all">All available ({available})</option>
            {[10, 20]
              .filter((size) => size < available)
              .map((size) => (
                <option key={size} value={String(size)}>
                  {size}
                </option>
              ))}
          </select>
        </div>
      </div>

      {exam ? (
        <div className="grid gap-4 @xl:grid-cols-2">
          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 text-sm font-medium text-fg">Time limit</legend>
            {(
              [
                ["default", `${DEFAULT_SECONDS_PER_QUESTION} seconds per question`],
                ["untimed", "Untimed"],
                ["custom", "Custom"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm text-fg">
                <input
                  type="radio"
                  name="timing"
                  value={value}
                  checked={timing === value}
                  onChange={() => setTiming(value)}
                  className="accent-[var(--accent)]"
                />
                {label}
              </label>
            ))}
            {timing === "custom" ? (
              <div className="flex items-center gap-2 pt-1 text-sm text-fg">
                <label htmlFor="mcq-minutes" className="sr-only">
                  Minutes
                </label>
                <input
                  id="mcq-minutes"
                  type="number"
                  min={1}
                  max={600}
                  value={minutes}
                  onChange={(event) => setMinutes(event.target.value)}
                  className="h-9 w-20 rounded-lg border border-border-strong bg-surface px-2 text-sm text-fg focus:border-accent focus:outline-none"
                />
                minutes
              </div>
            ) : null}
            <p className="text-[12.5px] text-fg-subtle">
              The exam is submitted when the time runs out.
            </p>
          </fieldset>
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-fg">Order</p>
            <label className="flex items-center gap-2 text-sm text-fg">
              <input
                type="checkbox"
                checked={shuffle}
                onChange={(event) => setShuffle(event.target.checked)}
                className="accent-[var(--accent)]"
              />
              Shuffle questions
            </label>
            <p className="text-[12.5px] text-fg-subtle">
              Options always keep the source&apos;s order.
            </p>
          </div>
        </div>
      ) : null}

      {error ? (
        <p id="mcq-start-error" role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" aria-disabled={pending || undefined}>
        {pending ? "Starting…" : mode === "learn" ? "Start learning" : "Start exam"}
      </Button>
    </form>
  );
}
