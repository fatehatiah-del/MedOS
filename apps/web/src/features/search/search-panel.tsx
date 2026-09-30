"use client";

import { Badge, EmptyState, Input, Kbd, Surface } from "@medos/ui";
import { Search } from "lucide-react";
import { useState } from "react";

import { SEARCH_INPUT_ID } from "@/components/shell/search-trigger";

/** What global search will cover (specification §26). */
const SEARCH_SCOPES = [
  "Courses",
  "Lectures",
  "Study Guides",
  "MCQs",
  "Question Bank",
  "Flashcards",
  "Notes",
  "Bookmarks",
] as const;

/**
 * The search field and its empty state. There is no index yet, so every query
 * honestly reports that nothing can be found.
 */
export function SearchPanel() {
  const [query, setQuery] = useState("");
  const trimmed = query.trim();

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
            placeholder="Search courses, lectures, questions, notes…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
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
          {SEARCH_SCOPES.map((scope) => (
            <li key={scope}>
              <Badge>{scope}</Badge>
            </li>
          ))}
        </ul>
      </form>

      <Surface aria-live="polite">
        {trimmed ? (
          <EmptyState
            headingLevel={2}
            icon={<Search />}
            title={`No results for “${trimmed}”`}
            description="Your library is empty until study material is synced, so there is nothing to search yet."
          />
        ) : (
          <EmptyState
            headingLevel={2}
            icon={<Search />}
            title="Nothing to search yet"
            description="Once your material is synced, results will show where each match comes from: course, week and lecture."
          />
        )}
      </Surface>
    </div>
  );
}
