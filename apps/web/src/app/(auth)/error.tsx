"use client"; // Error boundaries must be Client Components.

import { Button, EmptyState } from "@medos/ui";
import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";

export default function AuthError({
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
        title="Sign-in is unavailable"
        description={
          <>
            MedOS could not reach its sign-in service. This is usually a server configuration
            problem; the server log has the details.
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
