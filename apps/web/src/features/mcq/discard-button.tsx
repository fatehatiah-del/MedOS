"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { discardMcqSession } from "./actions";

/** Abandons an unfinished exam after confirmation. It then never counts in results. */
export function DiscardButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        aria-disabled={pending || undefined}
        onClick={() => {
          if (
            pending ||
            !window.confirm("Discard this unfinished exam? It will not count in your results.")
          ) {
            return;
          }
          startTransition(async () => {
            const result = await discardMcqSession({ sessionId });
            if (!result.ok) {
              setError(result.error);
              // The session changed elsewhere (submitted, say): show where it stands now.
              router.refresh();
            }
          });
        }}
        className="text-[13px] font-medium text-fg-muted hover:text-danger"
      >
        Discard
      </button>
      {error ? (
        <span role="alert" className="text-[12.5px] text-danger">
          {error}
        </span>
      ) : null}
    </>
  );
}
