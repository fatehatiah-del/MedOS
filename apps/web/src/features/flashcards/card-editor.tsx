"use client";

import { Button } from "@medos/ui";
import { type FormEvent, useId, useState, useTransition } from "react";

import type { ActionResult } from "./logic";

/*
 * Writing a card: front (the question) and back (the answer). Plain text with
 * line breaks. Used to add cards to a deck and to edit them.
 */

export function CardEditor({
  initialFront = "",
  initialBack = "",
  submitLabel,
  onSave,
  onCancel,
  onSaved,
}: {
  initialFront?: string;
  initialBack?: string;
  submitLabel: string;
  onSave: (card: { front: string; back: string }) => Promise<ActionResult<unknown>>;
  onCancel?: () => void;
  onSaved?: () => void;
}) {
  const id = useId();
  const [front, setFront] = useState(initialFront);
  const [back, setBack] = useState(initialBack);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    if (!front.trim() || !back.trim()) {
      setError("Write both sides of the card.");
      return;
    }
    startTransition(async () => {
      const result = await onSave({ front, back });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      if (!initialFront && !initialBack) {
        setFront("");
        setBack("");
      }
      onSaved?.();
    });
  };

  const field =
    "block w-full resize-y rounded-lg border border-border-strong bg-surface px-3 py-2 text-[15px] leading-relaxed text-fg focus:border-accent focus:outline-none";

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor={`${id}-front`} className="block text-sm font-medium text-fg">
          Front (question)
        </label>
        <textarea
          id={`${id}-front`}
          value={front}
          onChange={(event) => setFront(event.target.value)}
          rows={2}
          maxLength={5000}
          className={field}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${id}-back`} className="block text-sm font-medium text-fg">
          Back (answer)
        </label>
        <textarea
          id={`${id}-back`}
          value={back}
          onChange={(event) => setBack(event.target.value)}
          rows={3}
          maxLength={5000}
          className={field}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" variant="primary" aria-disabled={pending || undefined}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
