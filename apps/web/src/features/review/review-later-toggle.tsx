"use client";

import { Button } from "@medos/ui";
import { Check, Clock } from "lucide-react";
import { useState, useTransition } from "react";

import { setQuestionReviewLater } from "./actions";

/**
 * Marks a question (MCQ or Question Bank) Review Later, or removes the mark.
 * It is listed on the Review page until removed there or here. It never
 * changes a score or lecture completion.
 */
export function ReviewLaterToggle({
  resourceId,
  questionKey,
  initiallyMarked,
  onChange,
}: {
  resourceId: string;
  questionKey: string;
  initiallyMarked: boolean;
  /** Told of every saved change, so a parent can remember it across questions. */
  onChange?: (marked: boolean) => void;
}) {
  const [marked, setMarked] = useState(initiallyMarked);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    if (pending) return;
    const next = !marked;
    setMarked(next);
    startTransition(async () => {
      const result = await setQuestionReviewLater({ resourceId, questionKey, marked: next });
      if (result.ok) {
        setError(null);
        onChange?.(next);
        return;
      }
      setMarked(!next);
      setError(result.error);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={toggle}
        aria-pressed={marked}
        aria-disabled={pending || undefined}
        className="aria-pressed:border-accent aria-pressed:text-accent"
      >
        {marked ? <Check aria-hidden="true" /> : <Clock aria-hidden="true" />}
        Review later
      </Button>
      {error ? (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
