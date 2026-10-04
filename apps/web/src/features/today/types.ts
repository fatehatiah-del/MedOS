import type { StudyActivity } from "@medos/database";
import type { CourseId, IsoDate } from "@medos/shared";

/** Wall-clock time, 24-hour, e.g. "11:30". */
export type ClockTime = `${number}:${number}`;

export type ScheduleKind = "lecture" | "lab" | "exam";

export const SCHEDULE_KIND_LABELS: Record<ScheduleKind, string> = {
  lecture: "Lecture",
  lab: "Lab",
  exam: "Exam",
};

/** A university timetable entry or course exam of the day. */
export interface ScheduleEntry {
  id: string;
  courseId: CourseId;
  kind: ScheduleKind;
  start: ClockTime;
  end: ClockTime;
  location?: string;
}

/** One block of today's study plan, as the Study Plan page holds it. */
export interface StudyPlanItem {
  id: string;
  title: string;
  /** The course's colour token, when the block belongs to a course. */
  courseToken: string | null;
  courseName: string | null;
  activity: StudyActivity;
  minutes: number;
  done: boolean;
}

/**
 * Everything the Today screen needs: the campus date and time, the day's
 * university schedule, the day's study plan and the time studied.
 *
 * It holds academic data only. Who the user is comes from the session.
 */
export interface TodayOverview {
  date: IsoDate;
  /** Local time of the snapshot, used for the greeting. */
  time: ClockTime;
  schedule: ScheduleEntry[];
  plan: StudyPlanItem[];
  /** Active timed study today, from the study timer. */
  studiedMinutes: number;
}
