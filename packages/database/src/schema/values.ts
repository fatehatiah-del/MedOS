/**
 * Controlled vocabularies. Each list is the single source for both the
 * TypeScript union and the database CHECK constraint on its column.
 */

/** What a resource is, in terms of the learning cycle. */
export const RESOURCE_KINDS = [
  "study-guide",
  "original-lecture",
  "mcq",
  "question-bank",
  "image",
  "supplementary",
] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

/** Where a resource is in the import pipeline. The original file is kept in every state. */
export const RESOURCE_STATUSES = ["pending", "stored", "parsed", "failed"] as const;
export type ResourceStatus = (typeof RESOURCE_STATUSES)[number];

export const SYNC_STATUSES = ["pending", "synced", "changed", "missing", "failed"] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

export const CALENDAR_EVENT_TYPES = [
  "lecture",
  "lab",
  "exam",
  "midterm",
  "academic-deadline",
  "holiday",
  "study-session",
  "revision",
  "assignment",
  "personal",
] as const;
export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number];

/** University timetable events and the user's own events must stay distinguishable. */
export const CALENDAR_EVENT_ORIGINS = ["university", "personal"] as const;
export type CalendarEventOrigin = (typeof CALENDAR_EVENT_ORIGINS)[number];

export const EXAM_KINDS = ["midterm", "final", "other"] as const;
export type ExamKind = (typeof EXAM_KINDS)[number];

export const STUDY_ACTIVITIES = [
  "study-guide",
  "mcq",
  "question-bank",
  "flashcards",
  "revision",
  "other",
] as const;
export type StudyActivity = (typeof STUDY_ACTIVITIES)[number];
