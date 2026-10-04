import type { TodayOverview } from "./types";

/**
 * TEST SAMPLE — not real data.
 *
 * A hand-written Today overview for Wednesday 30 September 2026, used by the
 * unit tests of the Today summary. The Today screen itself always shows the
 * user's real date, schedule, plan and study time (see `getTodayOverview`).
 */
export const TODAY_FIXTURE: TodayOverview = {
  date: "2026-09-30",
  time: "15:00",
  schedule: [
    {
      id: "fixture-schedule-1",
      courseId: "public-health",
      kind: "lecture",
      start: "11:30",
      end: "14:50",
      location: "Sigma",
    },
  ],
  plan: [
    {
      id: "sample-plan-1",
      title: "Pharmacology flashcards",
      courseToken: "pharmacology",
      courseName: "Pharmacology",
      activity: "flashcards",
      minutes: 30,
      done: false,
    },
    {
      id: "sample-plan-2",
      title: "Study Guide: Cell injury",
      courseToken: "pathophysiology",
      courseName: "Pathophysiology",
      activity: "study-guide",
      minutes: 45,
      done: false,
    },
    {
      id: "sample-plan-3",
      title: "Review the receptor table",
      courseToken: null,
      courseName: null,
      activity: "revision",
      minutes: 25,
      done: true,
    },
  ],
  studiedMinutes: 0,
};
