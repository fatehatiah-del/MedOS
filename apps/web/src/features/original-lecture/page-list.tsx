"use client";

import type { PageAnnotationKind } from "@medos/database";
import { Bookmark, Clock, Pencil, StickyNote, Trash2 } from "lucide-react";

/*
 * The user's bookmarks, notes and Review Later pages in one lecture, each
 * opening its page. Managing them across lectures comes in a later phase.
 */

export interface ViewerAnnotation {
  id: string;
  kind: PageAnnotationKind;
  page: number;
  note: string | null;
}

const GROUPS: { kind: PageAnnotationKind; title: string; icon: typeof Bookmark; empty: string }[] =
  [
    {
      kind: "bookmark",
      title: "Bookmarked pages",
      icon: Bookmark,
      empty: "Use the bookmark button in the toolbar to mark the page you are on.",
    },
    { kind: "note", title: "Notes", icon: StickyNote, empty: "Add a note to the page you are on." },
    {
      kind: "review-later",
      title: "Review later",
      icon: Clock,
      empty: "Mark a page to come back to it.",
    },
  ];

export function PageList({
  annotations,
  pageCount,
  onGoTo,
  onEdit,
  onRemove,
}: {
  annotations: readonly ViewerAnnotation[];
  pageCount: number;
  onGoTo: (page: number) => void;
  onEdit: (annotation: ViewerAnnotation) => void;
  onRemove: (annotation: ViewerAnnotation) => void;
}) {
  return (
    <div className="space-y-6">
      {GROUPS.map(({ kind, title, icon: Icon, empty }) => {
        const items = annotations
          .filter((annotation) => annotation.kind === kind)
          .sort((a, b) => a.page - b.page);
        return (
          <div key={kind} className="space-y-2">
            <h2 className="flex items-center gap-1.5 text-[11.5px] font-semibold tracking-wider text-fg-subtle uppercase">
              <Icon aria-hidden="true" className="size-3.5" />
              {title}
              <span className="font-normal tabular-nums">({items.length})</span>
            </h2>
            {items.length === 0 ? (
              <p className="text-[12.5px] leading-relaxed text-fg-subtle">{empty}</p>
            ) : (
              <ul className="space-y-2">
                {items.map((annotation) => {
                  const exists = annotation.page <= pageCount;
                  return (
                    <li
                      key={annotation.id}
                      className="space-y-1.5 rounded-lg border border-border bg-surface px-3 py-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          disabled={!exists}
                          onClick={() => onGoTo(annotation.page)}
                          className="text-[13px] font-medium text-fg hover:text-accent disabled:cursor-default disabled:hover:text-fg"
                        >
                          Page {annotation.page}
                        </button>
                        <div className="flex items-center">
                          {annotation.kind === "note" ? (
                            <button
                              type="button"
                              aria-label={`Edit note on page ${annotation.page}`}
                              onClick={() => onEdit(annotation)}
                              className="flex size-7 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-fg"
                            >
                              <Pencil aria-hidden="true" className="size-3.5" />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            aria-label={`Remove ${title.toLowerCase()} item on page ${annotation.page}`}
                            onClick={() => onRemove(annotation)}
                            className="flex size-7 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-danger"
                          >
                            <Trash2 aria-hidden="true" className="size-3.5" />
                          </button>
                        </div>
                      </div>
                      {annotation.note ? (
                        <p className="border-l-2 border-border-strong pl-2 text-[13px] leading-relaxed whitespace-pre-wrap text-fg-muted">
                          {annotation.note}
                        </p>
                      ) : null}
                      {!exists ? (
                        <p className="text-[11.5px] text-fg-subtle">
                          This page is no longer in the current version of the file.
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
