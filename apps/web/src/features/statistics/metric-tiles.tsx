import type { ScopeMetrics } from "@medos/database";
import { formatMinutes } from "@medos/shared";
import type { ReactNode } from "react";

/*
 * Measures as tiles: a value and a line saying what it is made of. A measure
 * with nothing behind it reads "No data yet", never a zero dressed up as a
 * result.
 */

export interface Tile {
  label: string;
  /** Null when there is nothing to measure yet. */
  value: ReactNode | null;
  detail?: string;
}

export function TileGrid({ tiles }: { tiles: readonly Tile[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-7 @2xl:grid-cols-3 @4xl:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.label} className="min-w-0">
          <dt className="text-[13px] text-fg-muted">{tile.label}</dt>
          <dd className="mt-1.5">
            {tile.value === null ? (
              <span className="text-2xl font-medium text-fg-subtle">
                <span aria-hidden="true">—</span>
                <span className="sr-only">No data yet</span>
              </span>
            ) : (
              <span className="text-2xl font-medium text-fg tabular-nums">{tile.value}</span>
            )}
            {tile.detail ? (
              <span className="mt-0.5 block text-[12px] leading-snug text-fg-subtle">
                {tile.detail}
              </span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const percent = (value: number | null) => (value === null ? null : `${value}%`);

/** The measures every level shares: completion, time, MCQ, recall, flashcards, Review Later. */
export function metricTiles(
  metrics: ScopeMetrics,
  options: { completion?: boolean; studyTime?: boolean } = {},
): Tile[] {
  const recallRated =
    metrics.recall.again + metrics.recall.hard + metrics.recall.good + metrics.recall.easy;
  const tiles: Tile[] = [];
  if (options.completion !== false) {
    tiles.push({
      label: "Lectures complete",
      value: metrics.lectures === 0 ? null : `${metrics.completedLectures} / ${metrics.lectures}`,
      detail: "Marked complete by you",
    });
  }
  if (options.studyTime !== false) {
    tiles.push({
      label: "Study time",
      value: metrics.sessions === 0 ? null : formatMinutes(Math.floor(metrics.studySeconds / 60)),
      detail:
        metrics.sessions === 0
          ? "From the study timer"
          : `${metrics.sessions} ${metrics.sessions === 1 ? "session" : "sessions"}, active time`,
    });
  }
  tiles.push(
    {
      label: "MCQ accuracy",
      value: percent(metrics.mcq.accuracy),
      detail:
        metrics.mcq.answered === 0
          ? "No questions answered"
          : `${metrics.mcq.correct} of ${metrics.mcq.answered} answers correct`,
    },
    {
      label: "Repeated MCQ errors",
      value: metrics.mcq.answered === 0 ? null : metrics.mcq.repeatedErrors,
      detail: "Questions answered wrong more than once",
    },
    {
      label: "Question Bank",
      value: recallRated === 0 ? null : `${metrics.recall.again + metrics.recall.hard} weak`,
      detail:
        recallRated === 0
          ? "No questions rated"
          : `Latest ratings: ${metrics.recall.again} Again, ${metrics.recall.hard} Hard, ${metrics.recall.good} Good, ${metrics.recall.easy} Easy`,
    },
    {
      label: "Flashcard retention",
      value: percent(metrics.flashcards.retention30),
      detail:
        metrics.flashcards.reviews30 === 0
          ? "No reviews in the last 30 days"
          : `Reviews not rated Again, last 30 days (${metrics.flashcards.reviews30})`,
    },
    {
      label: "Flashcards",
      value:
        metrics.flashcards.cards === 0
          ? null
          : `${metrics.flashcards.reviewed} / ${metrics.flashcards.cards}`,
      detail:
        metrics.flashcards.cards === 0
          ? "No cards yet"
          : `Reviewed at least once · ${metrics.flashcards.lapses} ${metrics.flashcards.lapses === 1 ? "lapse" : "lapses"}`,
    },
    {
      label: "Review Later",
      value: metrics.reviewLater,
      detail: "Items marked to come back to",
    },
  );
  return tiles;
}
