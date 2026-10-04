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
  "flashcards",
  "image",
  "supplementary",
] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

/**
 * Where a resource is in the import pipeline. The original file is kept in every state.
 * - `stored`: the original is preserved; it has not been parsed (yet, or since it changed);
 * - `parsed`: its structured content is current;
 * - `failed`: it could not be read (`processing_error` says why);
 * - `unsupported`: MedOS has no parser for this kind of file (`processing_error` says why).
 */
export const RESOURCE_STATUSES = ["pending", "stored", "parsed", "failed", "unsupported"] as const;
export type ResourceStatus = (typeof RESOURCE_STATUSES)[number];

/**
 * Where a source file stands after the last sync:
 * - `synced`: imported and attached to a lecture;
 * - `needs-review`: kept on record but not attached, because its course, week,
 *   lecture or kind could not be determined with confidence;
 * - `missing`: seen before, absent from the source folder now (nothing deleted);
 * - `ignored`: excluded by a manual override;
 * - `failed`: could not be read.
 * `pending` and `changed` are transient states during a sync.
 */
export const SYNC_STATUSES = [
  "pending",
  "synced",
  "changed",
  "missing",
  "failed",
  "needs-review",
  "ignored",
] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

/**
 * Where structured content comes from. Imported source material and future
 * AI-generated material must always stay distinguishable.
 */
export const CONTENT_ORIGINS = ["source", "ai-generated"] as const;
export type ContentOrigin = (typeof CONTENT_ORIGINS)[number];

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

/** What a user can attach to a passage or section of a study guide. */
export const ANNOTATION_KINDS = ["highlight", "note", "bookmark", "review-later"] as const;
export type AnnotationKind = (typeof ANNOTATION_KINDS)[number];

/** What a user can attach to a page of an original lecture. */
export const PAGE_ANNOTATION_KINDS = ["bookmark", "note", "review-later"] as const;
export type PageAnnotationKind = (typeof PAGE_ANNOTATION_KINDS)[number];

/** How a set of MCQs is practised. */
export const MCQ_MODES = ["learn", "exam", "usmle"] as const;
export type McqMode = (typeof MCQ_MODES)[number];

/** Where an MCQ session stands. A discarded exam never counts in results. */
export const MCQ_SESSION_STATUSES = ["in-progress", "submitted", "discarded"] as const;
export type McqSessionStatus = (typeof MCQ_SESSION_STATUSES)[number];
