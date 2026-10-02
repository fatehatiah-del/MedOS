"use client";

import { cn } from "@medos/ui";
import { type MouseEvent, useEffect, useState } from "react";

import { revealSection } from "./reveal";
import type { TocEntry } from "./structure";

/*
 * MedOS's own contents navigation, built from the guide's headings. It is
 * application navigation, separate from any contents page the source document
 * contains (which is shown as source text). The current section is marked as
 * the reader scrolls.
 */

function flatten(entries: readonly TocEntry[]): string[] {
  return entries.flatMap((entry) => [entry.id, ...flatten(entry.children)]);
}

/** The section whose heading was passed most recently, reading down the page. */
function useCurrentSection(entries: readonly TocEntry[]): string | null {
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => {
    const ids = flatten(entries);
    let frame = 0;
    const update = () => {
      frame = 0;
      let found: string | null = null;
      for (const id of ids) {
        const heading = document.getElementById(id);
        if (heading && heading.getBoundingClientRect().top <= 140) found = id;
        else if (heading) break;
      }
      setCurrent(found ?? ids[0] ?? null);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [entries]);
  return current;
}

function Entries({
  entries,
  current,
  onNavigate,
  depth,
}: {
  entries: readonly TocEntry[];
  current: string | null;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>, id: string) => void;
  depth: number;
}) {
  return (
    <ol className={cn("space-y-0.5", depth > 0 && "mt-0.5 ml-3 border-l border-border pl-2")}>
      {entries.map((entry) => (
        <li key={entry.id}>
          <a
            href={`#${entry.id}`}
            onClick={(event) => onNavigate(event, entry.id)}
            aria-current={current === entry.id ? "location" : undefined}
            className={cn(
              "block rounded-md px-2 py-1 leading-snug transition-colors duration-150 hover:bg-hover hover:text-fg",
              depth === 0 ? "text-[13px] font-medium" : "text-[12.5px]",
              current === entry.id ? "bg-accent-soft text-accent" : "text-fg-muted",
            )}
          >
            {entry.label}
          </a>
          {entry.children.length > 0 ? (
            <Entries
              entries={entry.children}
              current={current}
              onNavigate={onNavigate}
              depth={depth + 1}
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export function ReaderToc({
  entries,
  onNavigate,
  id,
}: {
  entries: readonly TocEntry[];
  /** Called after navigating, e.g. to close the drawer that holds the list. */
  onNavigate?: (sectionId: string) => void;
  id?: string;
}) {
  const current = useCurrentSection(entries);
  const navigate = (event: MouseEvent<HTMLAnchorElement>, sectionId: string) => {
    // Keep the browser's own behaviour for new tabs and windows.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    if (onNavigate) onNavigate(sectionId);
    else revealSection(sectionId);
  };
  return (
    <nav aria-label="Study Guide contents" id={id}>
      <p className="mb-2 px-2 text-[11.5px] font-semibold tracking-wider text-fg-subtle uppercase">
        Contents
      </p>
      <Entries entries={entries} current={current} onNavigate={navigate} depth={0} />
    </nav>
  );
}
