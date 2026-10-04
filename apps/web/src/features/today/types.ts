import type { CourseId, IsoDate } from "@medos/shared";

/** Wall-clock time, 24-hour, e.g. "11:30". */
export type ClockTime = `${number}:${number}`;

export type ScheduleKind = "lecture" | "lab";

export const SCHEDULE_KIND_LABELS: Record<ScheduleKind, string> = {
  lecture: "Lecture",
  lab: "Lab",
};

/** A university timetable entry for the day. */
export interface ScheduleEntry {
  id: string;
  courseId: CourseId;
  kind: ScheduleKind;
  start: ClockTime;
  end: ClockTime;
  location?: string;
}

export type StudyActivity =
  "study-guide" | "mcq" | "question-bank" | "flashcards" | "review" | "weak-questions" | "revision";

export const STUDY_ACTIVITY_LABELS: Record<StudyActivity, string> = {
  "study-guide": "Study Guide",
  mcq: "MCQ",
  "question-bank": "Question Bank",
  flashcards: "Flashcards",
  review: "Review",
  "weak-questions": "Weak Questions",
  revision: "Revision",
};

/** One recommended block of study. */
export interface StudyPlanItem {
  id: string;
  courseId: CourseId;
  /** What the block covers, e.g. "Week 1 — Pharmacodynamics I". */
  detail?: string;
  activity: StudyActivity;
  minutes: number;
}

/**
 * Everything the Today screen needs. `source` records where the data came
 * from so fixture data can never be mistaken for the user's real schedule.
 *
 * It holds academic data only. Who the user is comes from the session.
 */
export interface TodayOverview {
  source: "fixture";
  date: IsoDate;
  /** Local time of the snapshot, used for the greeting. */
  time: ClockTime;
  schedule: ScheduleEntry[];
  plan: StudyPlanItem[];
  /** Active timed study today, from the study timer. Real even while the rest is a fixture. */
  studiedMinutes: number;
}
