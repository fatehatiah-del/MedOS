import type { TodayOverview } from "./types";

/**
 * DEVELOPMENT FIXTURE — not real data.
 *
 * A hand-written snapshot of Wednesday 30 September 2026 used to demonstrate
 * the Today layout before the database, timetable import and study planner
 * exist. Replace `getTodayOverview` (not the page) when those arrive.
 */
export const TODAY_FIXTURE: TodayOverview = {
  source: "fixture",
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
      id: "fixture-plan-1",
      courseId: "pharmacology",
      detail: "Week 1 — Pharmacodynamics I",
      activity: "review",
      minutes: 30,
    },
    {
      id: "fixture-plan-2",
      courseId: "pathophysiology",
      detail: "Week 1",
      activity: "study-guide",
      minutes: 45,
    },
    {
      id: "fixture-plan-3",
      courseId: "microbiology",
      activity: "weak-questions",
      minutes: 25,
    },
  ],
  // Replaced by the real study time from the study timer (see get-today-overview.ts).
  studiedMinutes: 0,
};
