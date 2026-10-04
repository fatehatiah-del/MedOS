"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteStudySession } from "./actions";

/** Deletes a finished study session after confirmation, for a timer left running by mistake. */
export function DeleteSessionButton({ sessionId, label }: { sessionId: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        aria-label={`Delete ${label}`}
        aria-disabled={pending || undefined}
        onClick={() => {
          if (
            pending ||
            !window.confirm("Delete this study session? Its time will no longer be counted.")
          ) {
            return;
          }
          startTransition(async () => {
            const result = await deleteStudySession({ sessionId });
            if (!result.ok) {
              setError(result.error);
              router.refresh();
            }
          });
        }}
        className="text-[12.5px] font-medium text-fg-subtle hover:text-danger"
      >
        Delete
      </button>
      {error ? (
        <span role="alert" className="text-[12.5px] text-danger">
          {error}
        </span>
      ) : null}
    </>
  );
}
