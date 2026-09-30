"use client"; // Error boundaries must be Client Components.

import "./globals.css";

import { useEffect } from "react";

/**
 * Last-resort boundary for failures in the root layout. It replaces the root
 * layout, so it renders its own <html> and <body> and avoids app components.
 */
export default function GlobalError({
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
    <html lang="en">
      <body>
        <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="font-serif text-2xl font-medium">MedOS could not start</h1>
          <p className="max-w-sm text-sm leading-relaxed text-fg-muted">
            An unexpected error stopped the application from loading. Your study data has not been
            changed.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-accent-hover"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
