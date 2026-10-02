"use client";

import { cn } from "@medos/ui";
import { Bookmark, BookmarkCheck, Clock, StickyNote } from "lucide-react";

import { useReader } from "./reader-context";

/**
 * Bookmark, Review Later and Add note for a whole section, beside its
 * heading. Fully keyboard operable, with no text selection needed.
 */
export function SectionActions({ sectionId, label }: { sectionId: string; label: string }) {
  const { annotations, annotate, remove, openNoteEditor } = useReader();
  const existing = (kind: "bookmark" | "review-later") =>
    annotations.find(
      (annotation) =>
        annotation.kind === kind &&
        annotation.status === "section" &&
        annotation.sectionId === sectionId,
    );
  const bookmark = existing("bookmark");
  const later = existing("review-later");
  const target = { sectionId, unitPath: null, start: null, end: null, quote: null };

  // Not blocked while another save is in flight: adding is idempotent on the server.
  const toggle = (kind: "bookmark" | "review-later") => {
    const current = kind === "bookmark" ? bookmark : later;
    void (current ? remove(current) : annotate(kind, target));
  };

  const button =
    "flex size-8 items-center justify-center rounded-lg text-fg-subtle transition-colors duration-150 hover:bg-hover hover:text-fg aria-pressed:text-accent";

  return (
    <div
      className="flex shrink-0 items-center gap-0.5"
      role="group"
      aria-label={`Actions for ${label}`}
    >
      <button
        type="button"
        aria-pressed={bookmark !== undefined}
        aria-label={`Bookmark section: ${label}`}
        title={bookmark ? "Remove bookmark" : "Bookmark this section"}
        onClick={() => toggle("bookmark")}
        className={button}
      >
        {bookmark ? (
          <BookmarkCheck aria-hidden="true" className="size-4" />
        ) : (
          <Bookmark aria-hidden="true" className="size-4" />
        )}
      </button>
      <button
        type="button"
        aria-pressed={later !== undefined}
        aria-label={`Review later: ${label}`}
        title={later ? "Remove from Review Later" : "Review this section later"}
        onClick={() => toggle("review-later")}
        className={cn(button)}
      >
        <Clock aria-hidden="true" className="size-4" />
      </button>
      <button
        type="button"
        aria-label={`Add note to section: ${label}`}
        title="Add a note to this section"
        onClick={() => openNoteEditor({ mode: "create", target, quote: label })}
        className={button}
      >
        <StickyNote aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
