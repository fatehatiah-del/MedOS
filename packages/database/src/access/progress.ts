import { CURRENT_SEMESTER, type IsoDate, zonedDate, zonedInstant } from "@medos/shared";
import {
  MASTERED_INTERVAL_DAYS,
  type Streak,
  type WeeklyTarget,
  streakOf,
  weekStart,
  weeklyTarget,
} from "@medos/study-engine";
import { and, asc, count, eq, gte, isNotNull, sql } from "drizzle-orm";

import type { Database } from "../client";
import {
  courses,
  flashcardReviews,
  flashcards,
  lectureProgress,
  lectures,
  mcqAttempts,
  questionBankAttempts,
  semesters,
  studySessions,
} from "../schema";

import { createPlannerAccess } from "./planner";

/*
 * Progress (specification §29): the study streak, the weekly target, and
 * plain counts of what the user has done. Everything is read from recorded
 * sessions and activity; the rules (what a streak is, what the week's target
 * is) are the tested functions of the study engine.
 */

const ZONE = CURRENT_SEMESTER.timeZone;

export interface ProgressSummary {
  today: IsoDate;
  streak: Streak;
  week: WeeklyTarget;
  /** Active study, all time, in minutes. */
  studyMinutes: number;
  questions: {
    /** MCQ answers and Question Bank reveals, all time and since Monday. */
    total: number;
    thisWeek: number;
  };
  flashcards: {
    cards: number;
    /** Cards whose next review is at least MASTERED_INTERVAL_DAYS after the last. */
    mastered: number;
    /** Share of reviews in the last 30 days not rated Again; null without reviews. */
    retention30: number | null;
  };
  courses: {
    id: string;
    shortName: string;
    colorToken: string | null;
    lectures: number;
    completed: number;
  }[];
}

export function createProgressAccess(db: Database, userId: string) {
  const planner = createPlannerAccess(db, userId);

  return {
    async summary(now = new Date()): Promise<ProgressSummary> {
      const today = zonedDate(now, ZONE);
      const monday = zonedInstant(weekStart(today), "00:00", ZONE);
      const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [
        sessions,
        settings,
        [mcqAll],
        [mcqWeek],
        [recallAll],
        [recallWeek],
        [cards],
        [reviews],
        courseRows,
      ] = await Promise.all([
        db
          .select({ startedAt: studySessions.startedAt, seconds: studySessions.activeSeconds })
          .from(studySessions)
          .where(and(eq(studySessions.userId, userId), isNotNull(studySessions.endedAt))),
        planner.settings.get(),
        db
          .select({ n: count() })
          .from(mcqAttempts)
          .where(and(eq(mcqAttempts.userId, userId), isNotNull(mcqAttempts.selectedOption))),
        db
          .select({ n: count() })
          .from(mcqAttempts)
          .where(
            and(
              eq(mcqAttempts.userId, userId),
              isNotNull(mcqAttempts.selectedOption),
              gte(mcqAttempts.answeredAt, monday),
            ),
          ),
        db
          .select({ n: count() })
          .from(questionBankAttempts)
          .where(eq(questionBankAttempts.userId, userId)),
        db
          .select({ n: count() })
          .from(questionBankAttempts)
          .where(
            and(
              eq(questionBankAttempts.userId, userId),
              gte(questionBankAttempts.revealedAt, monday),
            ),
          ),
        db
          .select({
            cards: sql<number>`count(*)::int`,
            mastered: sql<number>`(count(*) filter (where ${flashcards.scheduledDays} >= ${MASTERED_INTERVAL_DAYS}))::int`,
          })
          .from(flashcards)
          .where(and(eq(flashcards.userId, userId), sql`${flashcards.deletedAt} is null`)),
        db
          .select({
            total: sql<number>`count(*)::int`,
            remembered: sql<number>`(count(*) filter (where ${flashcardReviews.rating} <> 'again'))::int`,
          })
          .from(flashcardReviews)
          .where(
            and(eq(flashcardReviews.userId, userId), gte(flashcardReviews.reviewedAt, since30)),
          ),
        db
          .select({
            id: courses.id,
            shortName: courses.shortName,
            colorToken: courses.colorToken,
            lectures: sql<number>`count(${lectures.id})::int`,
            completed: sql<number>`count(${lectureProgress.completedAt})::int`,
          })
          .from(courses)
          .innerJoin(semesters, eq(semesters.id, courses.semesterId))
          .leftJoin(lectures, eq(lectures.courseId, courses.id))
          .leftJoin(lectureProgress, eq(lectureProgress.lectureId, lectures.id))
          .where(and(eq(courses.userId, userId), eq(semesters.slug, CURRENT_SEMESTER.id)))
          .groupBy(courses.id)
          .orderBy(asc(courses.position)),
      ]);

      // Minutes of finished study per campus day; a day with a minute or more is a study day.
      const secondsByDay = new Map<IsoDate, number>();
      for (const session of sessions) {
        const day = zonedDate(session.startedAt, ZONE);
        secondsByDay.set(day, (secondsByDay.get(day) ?? 0) + session.seconds);
      }
      const minutesByDay = new Map(
        [...secondsByDay].map(([day, seconds]) => [day, Math.floor(seconds / 60)] as const),
      );
      const studyDays = [...minutesByDay].filter(([, minutes]) => minutes >= 1).map(([day]) => day);

      return {
        today,
        streak: streakOf(studyDays, today),
        week: weeklyTarget(today, settings, minutesByDay),
        studyMinutes: [...minutesByDay.values()].reduce((total, minutes) => total + minutes, 0),
        questions: {
          total: (mcqAll?.n ?? 0) + (recallAll?.n ?? 0),
          thisWeek: (mcqWeek?.n ?? 0) + (recallWeek?.n ?? 0),
        },
        flashcards: {
          cards: cards?.cards ?? 0,
          mastered: cards?.mastered ?? 0,
          retention30:
            (reviews?.total ?? 0) > 0
              ? Math.round(((reviews?.remembered ?? 0) / (reviews?.total ?? 1)) * 100)
              : null,
        },
        courses: courseRows,
      };
    },
  };
}
