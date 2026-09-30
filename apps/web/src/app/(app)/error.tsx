"use client"; // Error boundaries must be Client Components.

import { Button, EmptyState } from "@medos/ui";
import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert">
      <EmptyState
        headingLevel={2}
        icon={<TriangleAlert />}
        title="This page could not be displayed"
        description={
          <>
            Something went wrong while loading this page. Your study data has not been changed.
            {error.digest ? (
              <span className="mt-2 block text-xs text-fg-subtle">Reference: {error.digest}</span>
            ) : null}
          </>
        }
      >
        <Button variant="primary" onClick={() => retry()}>
          Try again
        </Button>
      </EmptyState>
    </div>
  );
}
