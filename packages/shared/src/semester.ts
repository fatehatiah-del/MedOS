import { type DateRange, type IsoDate, daysBetween, isWithinRange } from "./dates";

export interface SemesterDefinition {
  id: string;
  /** e.g. "Fall 2026" */
  name: string;
  /** e.g. "Semester 5" */
  label: string;
  academicYear: string;
  institution: string;
  programme: string;
  /** Lab group of the user. Only this group's labs belong in the timetable. */
  group: string;
  term: DateRange;
  midterms: DateRange;
  finals: DateRange;
}

/**
 * Semester 5 academic calendar. Individual subject examination dates are not
 * known in advance and are entered manually once the university releases them.
 */
export const FALL_2026: SemesterDefinition = {
  id: "2026-fall",
  name: "Fall 2026",
  label: "Semester 5",
  academicYear: "Year 3",
  institution: "European University Cyprus — Frankfurt Campus",
  programme: "Medicine / MD",
  group: "A",
  term: { start: "2026-09-28", end: "2027-01-29" },
  midterms: { start: "2026-11-12", end: "2026-11-18" },
  finals: { start: "2027-01-18", end: "2027-01-29" },
};

export const CURRENT_SEMESTER = FALL_2026;

/**
 * 1-based teaching week of `date`, counted in 7-day blocks from the first day
 * of term. Returns `null` outside the term.
 */
export function semesterWeekFor(
  date: IsoDate,
  semester: SemesterDefinition = CURRENT_SEMESTER,
): number | null {
  if (!isWithinRange(date, semester.term)) return null;
  return Math.floor(daysBetween(semester.term.start, date) / 7) + 1;
}

export type AcademicPeriodKind = "term" | "midterms" | "finals";

export interface AcademicPeriod {
  kind: AcademicPeriodKind;
  label: string;
  range: DateRange;
}

export function academicPeriods(semester: SemesterDefinition = CURRENT_SEMESTER): AcademicPeriod[] {
  return [
    { kind: "term", label: `${semester.name} semester`, range: semester.term },
    { kind: "midterms", label: "Midterm period", range: semester.midterms },
    { kind: "finals", label: "Final examination period", range: semester.finals },
  ];
}

export type PeriodStatus =
  | { state: "upcoming"; daysUntilStart: number }
  | { state: "active"; daysRemaining: number }
  | { state: "past" };

/** Where `date` falls relative to an inclusive period. */
export function periodStatus(date: IsoDate, range: DateRange): PeriodStatus {
  const daysUntilStart = daysBetween(date, range.start);
  if (daysUntilStart > 0) return { state: "upcoming", daysUntilStart };
  const daysRemaining = daysBetween(date, range.end);
  if (daysRemaining >= 0) return { state: "active", daysRemaining };
  return { state: "past" };
}
