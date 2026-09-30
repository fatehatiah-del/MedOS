import {
  type AcademicPeriod,
  type IsoDate,
  type PeriodStatus,
  academicPeriods,
  availableMinutesFor,
  periodStatus,
  semesterWeekFor,
} from "@medos/shared";

import type { ClockTime, TodayOverview } from "./types";

export function greetingFor(time: ClockTime): string {
  const hour = Number(time.split(":")[0]);
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export interface ExamPeriodSummary {
  period: AcademicPeriod;
  status: PeriodStatus;
}

/** Exam periods that have not finished yet, relative to `date`. */
export function upcomingExamPeriods(date: IsoDate): ExamPeriodSummary[] {
  return academicPeriods()
    .filter((period) => period.kind !== "term")
    .map((period) => ({ period, status: periodStatus(date, period.range) }))
    .filter(({ status }) => status.state !== "past");
}

export function describePeriodStatus(status: PeriodStatus): string {
  switch (status.state) {
    case "upcoming":
      return status.daysUntilStart === 1 ? "Tomorrow" : `In ${status.daysUntilStart} days`;
    case "active":
      return "In progress";
    case "past":
      return "Finished";
  }
}

export interface TodaySummary {
  /** Teaching week, or null outside the term. */
  week: number | null;
  greeting: string;
  availableMinutes: number;
  plannedMinutes: number;
  examPeriods: ExamPeriodSummary[];
}

/** Values derived from the overview and the academic calendar. */
export function summariseToday(overview: TodayOverview): TodaySummary {
  return {
    week: semesterWeekFor(overview.date),
    greeting: greetingFor(overview.time),
    availableMinutes: availableMinutesFor(overview.date),
    plannedMinutes: overview.plan.reduce((total, item) => total + item.minutes, 0),
    examPeriods: upcomingExamPeriods(overview.date),
  };
}
