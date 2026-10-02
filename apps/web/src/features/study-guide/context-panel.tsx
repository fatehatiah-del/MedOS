"use client";

import type { AnnotationKind } from "@medos/database";
import { Progress } from "@medos/ui";
import { Bookmark, Clock, Highlighter, Pencil, StickyNote, Timer, Trash2 } from "lucide-react";
import Link from "next/link";
import { useId } from "react";

import { useReader } from "./reader-context";
import type { ReaderAnnotation } from "./reader-model";
import { revealAnnotation, revealSection } from "./reveal";

/*
 * The reader's context panel: how far the user has read, and their own
 * bookmarks, notes, Review Later items and highlights in this guide. It lists
 * and opens them; managing annotations across guides comes later.
 */

const GROUPS: {
  kind: AnnotationKind;
  title: string;
  icon: typeof Bookmark;
  empty: string;
}[] = [
  {
    kind: "bookmark",
    title: "Bookmarks",
    icon: Bookmark,
    empty: "Bookmark a section with the button beside its heading, or select text.",
  },
  {
    kind: "note",
    title: "Notes",
    icon: StickyNote,
    empty: "Select text and choose Add note, or add a note to a section.",
  },
  {
    kind: "review-later",
    title: "Review later",
    icon: Clock,
    empty: "Mark text or a section to come back to it.",
  },
  {
    kind: "highlight",
    title: "Highlights",
    icon: Highlighter,
    empty: "Select text and choose Highlight.",
  },
];

function excerpt(text: string, length = 140): string {
  return text.length > length ? `${text.slice(0, length).trimEnd()}…` : text;
}

function Item({
  annotation,
  onNavigate,
}: {
  annotation: ReaderAnnotation;
  onNavigate?: () => void;
}) {
  const { remove, openNoteEditor, pending } = useReader();
  const orphaned = annotation.status === "orphaned";
  const kindLabel = annotation.kind === "review-later" ? "Review Later item" : annotation.kind;
  return (
    <li className="space-y-1.5 rounded-lg border border-border bg-surface px-3 py-2.5">
      {annotation.status === "section" ? (
        <p className="text-[12px] font-medium text-fg-subtle">Section</p>
      ) : null}
      <button
        type="button"
        disabled={orphaned}
        onClick={() => {
          onNavigate?.();
          // Wait for a sheet to close before moving focus into the text.
          window.setTimeout(() => revealAnnotation(annotation), onNavigate ? 50 : 0);
        }}
        className="block w-full rounded text-left text-[13px] leading-relaxed text-fg hover:text-accent disabled:cursor-default disabled:hover:text-fg"
      >
        <span className="sr-only">Go to {kindLabel}: </span>
        {excerpt(annotation.quote)}
      </button>
      {annotation.note ? (
        <p className="border-l-2 border-border-strong pl-2 text-[13px] leading-relaxed whitespace-pre-wrap text-fg-muted">
          {annotation.note}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[11.5px] text-fg-subtle">
          {orphaned
            ? "This text is no longer in the current version of the guide."
            : annotation.sectionLabel}
        </p>
        <div className="flex shrink-0 items-center">
          {annotation.kind === "note" ? (
            <button
              type="button"
              aria-label={`Edit note: ${excerpt(annotation.note ?? "", 40)}`}
              onClick={() =>
                openNoteEditor({
                  mode: "edit",
                  annotationId: annotation.id,
                  note: annotation.note ?? "",
                  quote: annotation.quote,
                })
              }
              className="flex size-7 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-fg"
            >
              <Pencil aria-hidden="true" className="size-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            aria-label={`Remove ${kindLabel}: ${excerpt(annotation.quote, 40)}`}
            aria-disabled={pending || undefined}
            onClick={() => {
              if (pending) return;
              if (
                annotation.kind === "note" &&
                !window.confirm("Delete this note? Its text cannot be recovered.")
              ) {
                return;
              }
              void remove(annotation);
            }}
            className="flex size-7 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-danger"
          >
            <Trash2 aria-hidden="true" className="size-3.5" />
          </button>
        </div>
      </div>
    </li>
  );
}

export function ContextPanel({ onNavigate }: { onNavigate?: () => void }) {
  const { annotations, progress, lectureHref } = useReader();
  const headingId = useId();
  const atEnd = progress.sectionCount > 0 && progress.percent === 100;

  return (
    <section aria-labelledby={headingId} className="space-y-6">
      <h2 id={headingId} className="sr-only">
        Your progress and notes
      </h2>

      <div className="space-y-2.5">
        <h3 className="text-[11.5px] font-semibold tracking-wider text-fg-subtle uppercase">
          Reading progress
        </h3>
        <Progress
          value={progress.percent}
          label="Study Guide reading progress"
          valueText={`${progress.percent}%, ${progress.sectionsRead} of ${progress.sectionCount} sections`}
        />
        <p className="text-[13px] text-fg-muted">
          <span className="font-medium text-fg tabular-nums">{progress.percent}%</span> ·{" "}
          {progress.sectionsRead} of {progress.sectionCount} sections read
        </p>
        {progress.lastSectionId && !atEnd ? (
          <button
            type="button"
            onClick={() => {
              onNavigate?.();
              const id = progress.lastSectionId;
              if (id) window.setTimeout(() => revealSection(id), onNavigate ? 50 : 0);
            }}
            className="text-[13px] font-medium text-accent hover:underline"
          >
            Resume where you left off
          </button>
        ) : null}
        {atEnd ? (
          <p className="text-[12.5px] leading-relaxed text-fg-muted">
            You reached the end of this Study Guide. That does not complete the lecture: mark it
            complete yourself on the{" "}
            <Link href={lectureHref} className="font-medium text-accent hover:underline">
              lecture page
            </Link>{" "}
            when you are ready.
          </p>
        ) : null}
      </div>

      {GROUPS.map(({ kind, title, icon: Icon, empty }) => {
        const items = annotations.filter((annotation) => annotation.kind === kind);
        return (
          <div key={kind} className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-[11.5px] font-semibold tracking-wider text-fg-subtle uppercase">
              <Icon aria-hidden="true" className="size-3.5" />
              {title}
              <span className="font-normal tabular-nums">({items.length})</span>
            </h3>
            {items.length > 0 ? (
              <ul className="space-y-2">
                {items.map((annotation) => (
                  <Item key={annotation.id} annotation={annotation} onNavigate={onNavigate} />
                ))}
              </ul>
            ) : (
              <p className="text-[12.5px] leading-relaxed text-fg-subtle">{empty}</p>
            )}
          </div>
        );
      })}

      <div className="space-y-1.5 rounded-lg border border-dashed border-border-strong px-3 py-2.5">
        <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-fg-muted">
          <Timer aria-hidden="true" className="size-4" />
          Study timer
        </h3>
        <p className="text-[12.5px] text-fg-subtle">Arrives in a later phase.</p>
      </div>
    </section>
  );
}
