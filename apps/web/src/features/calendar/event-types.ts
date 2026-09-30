/**
 * Calendar event types from the specification, grouped by origin. University
 * events and the user's own sessions must always be visually distinguishable.
 * Presentation-only for now; the persisted model arrives with the database.
 */
export type CalendarEventOrigin = "university" | "personal";

export interface CalendarEventType {
  id: string;
  label: string;
  origin: CalendarEventOrigin;
}

export const CALENDAR_EVENT_TYPES: readonly CalendarEventType[] = [
  { id: "lecture", label: "Lecture", origin: "university" },
  { id: "lab", label: "Lab", origin: "university" },
  { id: "exam", label: "Exam", origin: "university" },
  { id: "midterm", label: "Midterm", origin: "university" },
  { id: "academic-deadline", label: "Academic Deadline", origin: "university" },
  { id: "holiday", label: "Holiday", origin: "university" },
  { id: "assignment", label: "Assignment", origin: "university" },
  { id: "study-session", label: "Study Session", origin: "personal" },
  { id: "revision", label: "Revision", origin: "personal" },
  { id: "personal", label: "Personal", origin: "personal" },
];

export const CALENDAR_VIEWS = [
  {
    id: "day",
    label: "Day",
    emptyDescription: "An hour-by-hour view of one day's lectures, labs and study sessions.",
  },
  {
    id: "week",
    label: "Week",
    emptyDescription: "Your Group A timetable alongside the study sessions you plan for the week.",
  },
  {
    id: "month",
    label: "Month",
    emptyDescription: "A month at a glance, with exams and deadlines marked.",
  },
  {
    id: "semester",
    label: "Semester",
    emptyDescription: "The whole term in one view, from the first week to the final examinations.",
  },
] as const;
