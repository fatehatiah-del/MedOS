"use client";

import type { Weakness } from "@medos/study-engine";
import { Button, Input } from "@medos/ui";
import Link from "next/link";
import { useId, useState, useTransition } from "react";

import { CourseMark } from "@/components/course-mark";
import { lectureHref } from "@/features/courses/progress";

import { markConceptDifficult, unmarkConceptDifficult } from "./actions";

/*
 * Weak topics, lectures and marked concepts, each with exactly the evidence
 * that put it here. No scores. A topic can be marked difficult (or unmarked)
 * where it is shown; a concept of the user's own can be added per course.
 */

export interface WeaknessCourse {
  id: string;
  slug: string;
  shortName: string;
  colorToken: string | null;
}

const KIND_LABEL: Record<Weakness["kind"], string> = {
  topic: "Topic",
  lecture: "Lecture",
  concept: "Concept",
};

function useAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) =>
    startTransition(async () => {
      setError(null);
      try {
        const result = await action();
        if (result.ok) onOk?.();
        else setError(result.error ?? "That change could not be saved.");
      } catch {
        setError("MedOS could not be reached. Check your connection and try again.");
      }
    });
  return { pending, error, run };
}

export function WeaknessList({
  weaknesses,
  courses,
  showCourse,
  empty,
}: {
  weaknesses: readonly Weakness[];
  courses: readonly WeaknessCourse[];
  /** Name each item's course (across the semester), or not (within a course). */
  showCourse: boolean;
  empty: string;
}) {
  const { pending, error, run } = useAction();
  const courseOf = new Map(courses.map((course) => [course.id, course]));
  if (weaknesses.length === 0) return <p className="text-sm text-fg-muted">{empty}</p>;

  return (
    <div className="space-y-2">
      {error ? (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : null}
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {weaknesses.map((weakness) => {
          const course = courseOf.get(weakness.courseId);
          return (
            <li key={weakness.key} className="space-y-1.5 px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="flex min-w-0 items-center gap-2 text-[15px] font-medium text-fg">
                  {showCourse && course ? <CourseMark token={course.colorToken} /> : null}
                  {weakness.lectureId && course && weakness.kind === "lecture" ? (
                    <Link
                      href={lectureHref(course.slug, weakness.lectureId)}
                      className="truncate hover:underline"
                    >
                      {weakness.label}
                    </Link>
                  ) : (
                    <span className="truncate">{weakness.label}</span>
                  )}
                  <span className="shrink-0 text-[12px] font-normal text-fg-subtle">
                    {KIND_LABEL[weakness.kind]}
                    {showCourse && course ? ` · ${course.shortName}` : ""}
                  </span>
                </p>
                {weakness.kind === "lecture" ? null : weakness.difficultId ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(() => unmarkConceptDifficult({ conceptId: weakness.difficultId }))
                    }
                    className="text-[12.5px] font-medium text-fg-muted hover:text-fg"
                  >
                    Unmark difficult
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        markConceptDifficult({
                          courseId: weakness.courseId,
                          label: weakness.label,
                        }),
                      )
                    }
                    className="text-[12.5px] font-medium text-accent hover:underline"
                  >
                    Mark difficult
                  </button>
                )}
              </div>
              <ul
                aria-label={`Evidence for ${weakness.label}`}
                className="space-y-0.5 text-[13px] text-fg"
              >
                {weakness.evidence.map((item) => (
                  <li key={item.signal} className="flex gap-2">
                    <span aria-hidden="true" className="text-fg-subtle">
                      ·
                    </span>
                    {item.text}
                  </li>
                ))}
              </ul>
              {weakness.context.map((line) => (
                <p key={line} className="text-[12.5px] text-fg-subtle">
                  {line}
                </p>
              ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A concept of the user's own, marked difficult within a course. */
export function MarkConceptForm({ courseId }: { courseId: string }) {
  const id = useId();
  const [label, setLabel] = useState("");
  const { pending, error, run } = useAction();
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        run(
          () => markConceptDifficult({ courseId, label }),
          () => setLabel(""),
        );
      }}
    >
      <label htmlFor={id} className="block text-sm font-medium text-fg">
        Mark a concept difficult
      </label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={label}
          maxLength={120}
          placeholder="e.g. Tachyphylaxis"
          onChange={(change) => setLabel(change.target.value)}
        />
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={pending || label.trim() === ""}
        >
          Mark
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}
