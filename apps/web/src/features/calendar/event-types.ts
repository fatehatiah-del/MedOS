import type { CalendarEventType } from "@medos/database";

/**
 * Calendar event types from the specification, grouped by origin. University
 * events and the user's own events must always be visually distinguishable.
 */
export type CalendarEventOrigin = "university" | "personal";

export const EVENT_TYPE_LABELS: Record<CalendarEventType, string> = {
  lecture: "Lecture",
  lab: "Lab",
  exam: "Exam",
  midterm: "Midterm",
  "academic-deadline": "Academic date",
  holiday: "Holiday",
  assignment: "Assignment",
  "study-session": "Study session",
  revision: "Revision",
  personal: "Personal",
};

/** Types the user can give their own events, in the order the form offers them. */
export const USER_TYPE_OPTIONS = [
  { id: "study-session", label: "Study session" },
  { id: "revision", label: "Revision" },
  { id: "assignment", label: "Assignment" },
  { id: "personal", label: "Personal" },
] as const;

export const EXAM_KIND_OPTIONS = [
  { id: "final", label: "Final exam" },
  { id: "midterm", label: "Midterm exam" },
  { id: "other", label: "Other exam" },
] as const;

export const CALENDAR_VIEWS = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "semester", label: "Semester" },
] as const;
