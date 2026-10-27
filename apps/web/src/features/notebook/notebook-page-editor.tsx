"use client";

import type { NotebookView } from "@medos/database";
import { Skeleton } from "@medos/ui";
import dynamic from "next/dynamic";

/** The notebook on its own page. The editor loads in the browser only. */
const NotebookEditor = dynamic(() => import("./editor").then((module) => module.NotebookEditor), {
  ssr: false,
  loading: () => (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-5">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-5 w-1/2" />
    </div>
  ),
});

export function NotebookPageEditor({
  lectureId,
  initial,
}: {
  lectureId: string;
  initial: NotebookView;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface">
      <NotebookEditor
        lectureId={lectureId}
        initial={initial}
        variant="page"
        placeholder="Write your notes for this lecture."
      />
    </div>
  );
}
