import type { Metadata } from "next";

import { NotFoundContent } from "@/components/not-found-content";

export const metadata: Metadata = { title: "Page not found" };

/** Not-found page for addresses outside the workspace. It shows nothing about the workspace. */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <NotFoundContent />
    </main>
  );
}
