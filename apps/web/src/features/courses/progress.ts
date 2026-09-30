/*
 * Progress in MedOS has one unit: the lecture, and one source: the user's own
 * decision to mark a lecture complete. Course and week progress are counts of
 * those decisions. Nothing here scores, estimates or infers.
 */

export type ProgressState = "empty" | "not-started" | "in-progress" | "complete";

export interface ProgressSummary {
  total: number;
  completed: number;
  /** Whole percentage, or null when there are no lectures: nothing is not 0%. */
  percent: number | null;
  state: ProgressState;
}

export function summariseProgress(completed: number, total: number): ProgressSummary {
  if (total <= 0) return { total: 0, completed: 0, percent: null, state: "empty" };
  const done = Math.min(Math.max(completed, 0), total);
  const state = done === 0 ? "not-started" : done === total ? "complete" : "in-progress";
  return { total, completed: done, percent: Math.round((done / total) * 100), state };
}

const lectures = (count: number) => (count === 1 ? "1 lecture" : `${count} lectures`);

/** "No lectures yet", "4 lectures", "1 of 4 lectures complete", "All 4 lectures complete". */
export function courseProgressLabel(summary: ProgressSummary): string {
  switch (summary.state) {
    case "empty":
      return "No lectures yet";
    case "not-started":
      return lectures(summary.total);
    case "complete":
      return summary.total === 1 ? "1 lecture, complete" : `All ${summary.total} lectures complete`;
    case "in-progress":
      return `${summary.completed} of ${summary.total} lectures complete`;
  }
}

/** Week-level wording: "No lectures yet", "1 lecture", "1 of 2 complete", "Complete". */
export function weekProgressLabel(summary: ProgressSummary): string {
  switch (summary.state) {
    case "empty":
      return "No lectures yet";
    case "not-started":
      return lectures(summary.total);
    case "complete":
      return "Complete";
    case "in-progress":
      return `${summary.completed} of ${summary.total} complete`;
  }
}

interface OutlineLecture {
  completedAt: Date | null;
}

interface OutlineWeek<L extends OutlineLecture> {
  lectures: readonly L[];
}

export function weekProgress(week: OutlineWeek<OutlineLecture>): ProgressSummary {
  return summariseProgress(
    week.lectures.filter((lecture) => lecture.completedAt !== null).length,
    week.lectures.length,
  );
}

/** Course progress from its outline. Empty weeks contribute nothing. */
export function outlineProgress(weeks: readonly OutlineWeek<OutlineLecture>[]): ProgressSummary {
  const all = weeks.flatMap((week) => week.lectures);
  return summariseProgress(
    all.filter((lecture) => lecture.completedAt !== null).length,
    all.length,
  );
}

/**
 * The first lecture, in week and lecture order, that is not yet complete.
 * A plain "where was I", not a recommendation: study planning comes later.
 */
export function nextIncompleteLecture<W extends OutlineWeek<OutlineLecture>>(
  weeks: readonly W[],
): { week: W; lecture: W["lectures"][number] } | null {
  for (const week of weeks) {
    for (const lecture of week.lectures) {
      if (lecture.completedAt === null) return { week, lecture };
    }
  }
  return null;
}

/** Lectures are addressed by id, so the address survives renaming and reordering. */
export function lectureHref(courseSlug: string, lectureId: string): string {
  return `/courses/${courseSlug}/lectures/${lectureId}`;
}

const SHORT_DAY = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
});

/** "28 Sep – 4 Oct" for a week's calendar dates (`YYYY-MM-DD`). */
export function formatWeekDates(startsOn: string | null, endsOn: string | null): string | null {
  if (!startsOn || !endsOn) return null;
  const day = (value: string) => SHORT_DAY.format(new Date(`${value}T00:00:00Z`));
  return `${day(startsOn)} – ${day(endsOn)}`;
}
