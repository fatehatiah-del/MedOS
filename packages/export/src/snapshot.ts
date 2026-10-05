/*
 * The MedOS export format, version 1.
 *
 * A snapshot is plain JSON: strings, numbers, booleans, null, arrays and
 * objects. Instants are ISO 8601 strings in UTC; calendar dates are
 * "YYYY-MM-DD". Ids are the database's UUIDs, so items that refer to each
 * other (a review to its card, an attempt to its session) still do in the
 * export. Every item that belongs to a lecture carries its `source`: course,
 * week, lecture and, where there is one, the file it came from.
 *
 * A change that removes or renames a field is a new schema version.
 */

export const EXPORT_FORMAT = "medos-export";
export const EXPORT_SCHEMA_VERSION = 1;

/** "2026-10-05T08:30:00.000Z" */
export type Instant = string;
/** "2026-10-05" */
export type CalendarDate = string;

/**
 * Where an item comes from. Course, then week and lecture when the item
 * belongs to one, then the file (Study Guide, Quiz, Question Bank, original
 * lecture) when it was made from one. `fileContentHash` is the SHA-256 of the
 * file the item was recorded against, so it can be matched to the file on disk.
 */
export interface ExportSource {
  courseId: string;
  course: string;
  courseSlug: string;
  week: number | null;
  lectureId: string | null;
  lecture: number | null;
  lectureTitle: string | null;
  resourceId: string | null;
  resourceKind: string | null;
  file: string | null;
  fileContentHash: string | null;
}

export interface ExportLecture {
  id: string;
  number: number;
  title: string;
  heldOn: CalendarDate | null;
  /** When the user marked the lecture complete; null while it is not. */
  completedAt: Instant | null;
}

export interface ExportWeek {
  id: string;
  number: number;
  startsOn: CalendarDate | null;
  endsOn: CalendarDate | null;
  lectures: ExportLecture[];
}

export interface ExportCourse {
  id: string;
  semesterId: string;
  slug: string;
  name: string;
  shortName: string;
  code: string | null;
  weeks: ExportWeek[];
}

export interface ExportSemester {
  id: string;
  slug: string;
  name: string;
  label: string;
  startsOn: CalendarDate;
  endsOn: CalendarDate;
}

/** A highlight, note, bookmark or Review Later mark on a Study Guide or a lecture page. */
export interface ExportAnnotation {
  id: string;
  /** Where it was made: a passage of a Study Guide, or a page of an original lecture. */
  on: "study-guide" | "lecture-page";
  kind: "highlight" | "note" | "bookmark" | "review-later";
  /** The passage, for a Study Guide annotation. */
  quote: string | null;
  /** Text just before and after the passage, to find it again. */
  prefix: string | null;
  suffix: string | null;
  /** The section heading, when the passage is still in the Study Guide. */
  section: string | null;
  sectionId: string | null;
  /** The page, for a lecture page annotation. */
  page: number | null;
  note: string | null;
  createdAt: Instant;
  updatedAt: Instant;
  source: ExportSource;
}

export interface ExportDeck {
  id: string;
  name: string;
  /** The deck's course and, for a lecture deck, its lecture. */
  source: ExportSource;
  createdAt: Instant;
}

/** A card's FSRS scheduling state, as MedOS uses it. */
export interface ExportFsrsState {
  state: "new" | "learning" | "review" | "relearning";
  due: Instant;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  lastReview: Instant | null;
}

export interface ExportCard {
  id: string;
  deckId: string;
  deck: string;
  front: string;
  back: string;
  /** "manual", or "study-guide" for a card made from a Study Guide passage. */
  origin: string;
  /** The Study Guide section and passage the card was made from. */
  sourceSection: string | null;
  sourceSectionId: string | null;
  sourceQuote: string | null;
  fsrs: ExportFsrsState;
  /** Set when the card was deleted; deleted cards are kept so their reviews still make sense. */
  deletedAt: Instant | null;
  createdAt: Instant;
  updatedAt: Instant;
  source: ExportSource;
}

export interface ExportCardReview {
  id: string;
  cardId: string;
  rating: "again" | "hard" | "good" | "easy";
  reviewedAt: Instant;
  durationMs: number;
  stateBefore: string;
  dueBefore: Instant;
  stateAfter: string;
  dueAfter: Instant;
  stabilityAfter: number;
  difficultyAfter: number;
  scheduledDaysAfter: number;
}

/** A question as the source file states it, when the file still contains it. */
export interface ExportMcqQuestion {
  number: number;
  stem: string;
  options: { label: string; text: string }[];
  /** The correct option's label; null when the source states none MedOS can read. */
  correctOption: string | null;
  topic: string | null;
  sourceRef: string | null;
}

export interface ExportMcqSession {
  id: string;
  mode: "learn" | "exam" | "usmle";
  status: "in-progress" | "submitted" | "discarded";
  questionCount: number;
  shuffled: boolean;
  timeLimitSeconds: number | null;
  startedAt: Instant;
  submittedAt: Instant | null;
  elapsedSeconds: number | null;
  source: ExportSource;
}

export interface ExportMcqAttempt {
  id: string;
  sessionId: string;
  mode: "learn" | "exam" | "usmle";
  questionKey: string;
  questionFingerprint: string;
  /** Null when the question is no longer in the file. */
  question: ExportMcqQuestion | null;
  /** The chosen option's label ("B"), or its position when the question is gone. */
  selectedOption: string | null;
  correct: boolean | null;
  flagged: boolean;
  timeSpentMs: number;
  attemptNumber: number;
  answeredAt: Instant;
  source: ExportSource;
}

export interface ExportRecallAttempt {
  id: string;
  itemKey: string;
  itemFingerprint: string;
  /** The question and the source's model answer, when the file still contains them. */
  question: string | null;
  modelAnswer: string | null;
  typedAnswer: string | null;
  rating: "again" | "hard" | "good" | "easy" | null;
  revealedAt: Instant;
  ratedAt: Instant | null;
  timeSpentMs: number;
  attemptNumber: number;
  source: ExportSource;
}

/** A quiz or Question Bank question the user marked Review Later. */
export interface ExportQuestionReview {
  id: string;
  questionKey: string;
  questionFingerprint: string;
  question: string | null;
  note: string | null;
  createdAt: Instant;
  source: ExportSource;
}

export interface ExportStudyGuideProgress {
  resourceId: string;
  furthestSection: string | null;
  furthestSectionId: string;
  furthestPosition: number;
  sectionCount: number;
  lastSectionId: string;
  updatedAt: Instant;
  source: ExportSource;
}

export interface ExportLecturePosition {
  resourceId: string;
  page: number;
  updatedAt: Instant;
  source: ExportSource;
}

export interface ExportStudySession {
  id: string;
  activity: string;
  startedAt: Instant;
  /** Null while the session is still open. */
  endedAt: Instant | null;
  activeSeconds: number;
  pausedReason: string | null;
  /** The course, and lecture if any, the session was for. */
  source: ExportSource | null;
}

export interface ExportCalendarEvent {
  id: string;
  type: string;
  /** "university" for imported timetable events, "user" for the user's own. */
  origin: string;
  title: string;
  startsAt: Instant;
  endsAt: Instant;
  allDay: boolean;
  timeZone: string;
  location: string | null;
  studentGroup: string | null;
  notes: string | null;
  /** For an exam: its kind ("midterm", "final", …). */
  exam: string | null;
  sourceKey: string | null;
  source: ExportSource | null;
}

export interface ExportPlanItem {
  id: string;
  position: number;
  /** "suggested", "manual" or "postponed". */
  origin: string;
  status: string;
  activity: string;
  title: string;
  minutes: number;
  edited: boolean;
  reasons: string[];
  postponedFrom: CalendarDate | null;
  source: ExportSource | null;
}

export interface ExportPlanDay {
  date: CalendarDate;
  suggestedAt: Instant | null;
  items: ExportPlanItem[];
}

export interface ExportDifficultConcept {
  id: string;
  label: string;
  createdAt: Instant;
  source: ExportSource;
}

export interface ExportSnapshot {
  format: typeof EXPORT_FORMAT;
  schemaVersion: typeof EXPORT_SCHEMA_VERSION;
  exportedAt: Instant;
  generator: "MedOS";
  user: { email: string; displayName: string };
  semesters: ExportSemester[];
  /** Course → week → lecture, with lecture completion. */
  courses: ExportCourse[];
  annotations: ExportAnnotation[];
  flashcards: {
    decks: ExportDeck[];
    cards: ExportCard[];
    reviews: ExportCardReview[];
  };
  mcq: {
    sessions: ExportMcqSession[];
    attempts: ExportMcqAttempt[];
  };
  questionBank: {
    attempts: ExportRecallAttempt[];
  };
  reviewLater: ExportQuestionReview[];
  progress: {
    studyGuides: ExportStudyGuideProgress[];
    originalLectures: ExportLecturePosition[];
  };
  studySessions: ExportStudySession[];
  calendar: ExportCalendarEvent[];
  planner: {
    availability: { weekdayMinutes: number; weekendMinutes: number } | null;
    days: ExportPlanDay[];
  };
  difficultConcepts: ExportDifficultConcept[];
}
