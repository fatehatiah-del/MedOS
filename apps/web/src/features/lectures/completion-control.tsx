"use client";

import { Button } from "@medos/ui";
import { CircleAlert, CircleCheck } from "lucide-react";
import { useId, useState, useTransition } from "react";

import { setLectureCompletion } from "./actions";

export interface CompletionControlProps {
  lectureId: string;
  /** When the lecture was marked complete, preformatted for display; null if it is not. */
  completedOn: string | null;
}

/**
 * The only way a lecture becomes complete: the user says so. Reversible at any
 * time, and nothing is lost either way.
 */
export function CompletionControl({ lectureId, completedOn }: CompletionControlProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();
  const complete = completedOn !== null;

  function toggle() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await setLectureCompletion({ lectureId, completed: !complete });
        if (!result.ok) setError(result.error);
      } catch {
        setError("The lecture could not be updated. Please try again.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-4 @xl:flex-row @xl:items-center @xl:justify-between">
        <div className="flex items-start gap-3">
          {complete ? (
            <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" />
          ) : (
            <span
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 rounded-full border-2 border-border-strong"
            />
          )}
          <div>
            <p className="text-[15px] font-medium text-fg">
              {complete ? "Complete" : "Not complete"}
            </p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-fg-muted">
              {complete
                ? `You marked this lecture complete on ${completedOn}.`
                : "Mark it complete when you consider it done. MedOS never does this for you."}
            </p>
          </div>
        </div>

        <Button
          variant={complete ? "secondary" : "primary"}
          onClick={toggle}
          disabled={pending}
          aria-describedby={error ? errorId : undefined}
          className="self-start @xl:self-auto"
        >
          {pending ? "Saving…" : complete ? "Mark as incomplete" : "Mark lecture complete"}
        </Button>
      </div>

      {/* Always mounted, so a failure is announced when it appears. */}
      <div role="alert">
        {error ? (
          <p id={errorId} className="flex items-center gap-2 text-[13px] text-danger">
            <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
