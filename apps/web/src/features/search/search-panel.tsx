"use client";

import type { SearchKind } from "@medos/database";
import { Badge, EmptyState, Input, Kbd, Surface } from "@medos/ui";
import { Search } from "lucide-react";
import Link from "next/link";
import { Fragment, type KeyboardEvent, useEffect, useRef, useState } from "react";

import { CourseMark } from "@/components/course-mark";
import { SEARCH_INPUT_ID } from "@/components/shell/search-trigger";

import { searchStudy } from "./actions";
import { KIND_LABELS, type SearchHit } from "./logic";

/*
 * Search across the study environment, as you type. Results are grouped by
 * kind, each with its course, week and lecture, and open at their source.
 * Arrow keys move from the field into the results and between them.
 */

const KIND_ORDER: SearchKind[] = [
  "course",
  "lecture",
  "study-guide",
  "mcq",
  "question-bank",
  "flashcard",
  "note",
  "bookmark",
];
const GROUP_TITLES: Record<SearchKind, string> = {
  course: "Courses",
  lecture: "Lectures",
  "study-guide": "Study Guides",
  mcq: "MCQs",
  "question-bank": "Question Bank",
  flashcard: "Flashcards",
  note: "Notes",
  bookmark: "Bookmarks",
};
const DELAY_MS = 200;

/** The text with every query word marked. */
function Highlighted({ text, terms }: { text: string; terms: readonly string[] }) {
  if (terms.length === 0) return <>{text}</>;
  const pattern = new RegExp(
    `(${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi",
  );
  return (
    <>
      {text.split(pattern).map((part, index) =>
        index % 2 === 1 ? (
          <mark key={index} className="rounded-sm bg-highlight px-0.5 text-fg">
            {part}
          </mark>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

export function SearchPanel({ initialQuery = "" }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchHit[] | null>(null);
  const [searched, setSearched] = useState("");
  const [failed, setFailed] = useState(false);
  const latest = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const trimmed = query.trim();

  useEffect(() => {
    const request = ++latest.current;
    // Keep the query in the address, so going back returns to these results.
    const url = new URL(window.location.href);
    if (trimmed) url.searchParams.set("q", trimmed);
    else url.searchParams.delete("q");
    window.history.replaceState(window.history.state, "", url);
    if (!trimmed) return;
    const timer = window.setTimeout(async () => {
      try {
        const hits = await searchStudy({ query: trimmed });
        if (request !== latest.current) return;
        setResults(hits);
        setSearched(trimmed);
        setFailed(false);
      } catch {
        if (request === latest.current) setFailed(true);
      }
    }, DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [trimmed]);

  const terms = [...new Set(searched.toLowerCase().split(/\s+/).filter(Boolean))];
  const shown = trimmed && searched === trimmed ? (results ?? []) : null;

  const links = () => [
    ...(listRef.current?.querySelectorAll<HTMLAnchorElement>("[data-search-result]") ?? []),
  ];
  const onFieldKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      links()[0]?.focus();
    }
  };
  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const all = links();
    const index = all.indexOf(document.activeElement as HTMLAnchorElement);
    if (index < 0) return;
    event.preventDefault();
    if (event.key === "ArrowUp" && index === 0) {
      document.getElementById(SEARCH_INPUT_ID)?.focus();
      return;
    }
    all[
      Math.min(all.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)))
    ]?.focus();
  };

  return (
    <div className="space-y-8">
      <form role="search" onSubmit={(event) => event.preventDefault()} className="space-y-4">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-fg-subtle"
          />
          <Input
            id={SEARCH_INPUT_ID}
            type="search"
            autoFocus
            autoComplete="off"
            aria-label="Search your study library"
            aria-controls="search-results"
            placeholder="Search courses, lectures, questions, notes…"
            value={query}
            maxLength={200}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onFieldKeyDown}
            className="h-12 rounded-xl pr-24 pl-11 text-[15px]"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-4 hidden -translate-y-1/2 items-center gap-1 sm:flex"
          >
            <Kbd>Ctrl</Kbd>
            <Kbd>K</Kbd>
          </span>
        </div>
        <ul aria-label="Search covers" className="flex flex-wrap gap-1.5">
          {KIND_ORDER.map((kind) => (
            <li key={kind}>
              <Badge>{GROUP_TITLES[kind]}</Badge>
            </li>
          ))}
        </ul>
      </form>

      <p role="status" className="sr-only">
        {shown === null
          ? ""
          : shown.length === 0
            ? `No results for ${searched}.`
            : `${shown.length} ${shown.length === 1 ? "result" : "results"} for ${searched}.`}
      </p>

      <div id="search-results" ref={listRef} onKeyDown={onListKeyDown}>
        {failed ? (
          <p role="alert" className="text-sm text-danger">
            Search could not reach MedOS. Check your connection and try again.
          </p>
        ) : !trimmed ? (
          <Surface>
            <EmptyState
              headingLevel={2}
              icon={<Search />}
              title="Search everything you study"
              description="Courses, lectures, Study Guide sections, MCQs, Question Bank items, flashcards, notes and bookmarks. Every word you type must match. Results show where each one comes from."
            />
          </Surface>
        ) : shown === null ? (
          <p className="text-sm text-fg-muted">Searching…</p>
        ) : shown.length === 0 ? (
          <Surface>
            <EmptyState
              headingLevel={2}
              icon={<Search />}
              title={`No results for “${searched}”`}
              description="Try fewer or different words. Search covers synced material and everything you have written in MedOS."
            />
          </Surface>
        ) : (
          <div className="space-y-8">
            {KIND_ORDER.map((kind) => {
              const group = shown.filter((hit) => hit.kind === kind);
              if (group.length === 0) return null;
              return (
                <section key={kind} aria-labelledby={`search-group-${kind}`} className="space-y-2">
                  <h2
                    id={`search-group-${kind}`}
                    className="text-[11px] font-semibold tracking-[0.09em] text-fg-subtle uppercase"
                  >
                    {GROUP_TITLES[kind]} <span className="tabular-nums">({group.length})</span>
                  </h2>
                  <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
                    {group.map((hit) => (
                      <li key={`${hit.kind}-${hit.id}`}>
                        <Link
                          href={hit.href}
                          data-search-result=""
                          className="block space-y-1 px-4 py-3 transition-colors duration-150 hover:bg-subtle/60 focus-visible:bg-subtle/60"
                        >
                          <span className="flex items-baseline justify-between gap-3">
                            <span className="line-clamp-2 text-[15px] font-medium text-fg">
                              <Highlighted text={hit.title} terms={terms} />
                            </span>
                            <Badge className="shrink-0">{KIND_LABELS[hit.kind]}</Badge>
                          </span>
                          {hit.snippet ? (
                            <span className="line-clamp-2 block text-[13px] text-fg-muted">
                              <Highlighted text={hit.snippet} terms={terms} />
                            </span>
                          ) : null}
                          {hit.course ? (
                            <span className="flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-fg-subtle">
                              <CourseMark token={hit.course.colorToken} />
                              <span>{hit.course.shortName}</span>
                              {hit.lecture ? (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>Week {hit.lecture.weekNumber}</span>
                                  <span aria-hidden="true">·</span>
                                  <span>{hit.lecture.title}</span>
                                </>
                              ) : null}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
