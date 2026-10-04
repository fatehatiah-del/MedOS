import {
  CURRENT_SEMESTER,
  type IsoDate,
  addDays,
  daysBetween,
  semesterWeekFor,
  zonedDate,
} from "@medos/shared";
import { type Weakness, detectWeaknesses } from "@medos/study-engine";
import { and, asc, count, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";

import type { Database } from "../client";
import {
  courses,
  difficultConcepts,
  flashcardDecks,
  flashcardReviews,
  flashcards,
  lectureProgress,
  lectures,
  questionBankAttempts,
  resources,
  semesters,
  studySessions,
  weeks,
} from "../schema";

import { createCalendarAccess } from "./calendar";
import {
  type SignalScope,
  flashcardScope,
  lapsesByLecture,
  latestRecall,
  mcqQuestionStats,
  reviewLaterByLecture,
} from "./signals";

/*
 * Statistics (specification §27) and weaknesses (§28), computed only from the
 * user's own recorded activity. Nothing is estimated: a measure with no data
 * is null, never zero dressed up as a result. Weaknesses come from the rules
 * of the weakness engine and carry their evidence; there is no mastery score.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (value: string) => UUID.test(value);
const ZONE = CURRENT_SEMESTER.timeZone;
export const MAX_CONCEPT_LABEL = 120;

/** A share as a whole percentage, or null when there is nothing to measure. */
const share = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 100) : null;

export interface ScopeMetrics {
  lectures: number;
  completedLectures: number;
  studySeconds: number;
  sessions: number;
  mcq: {
    answered: number;
    correct: number;
    /** Null until a question has been answered. */
    accuracy: number | null;
    questions: number;
    /** Questions answered wrong more than once. */
    repeatedErrors: number;
  };
  recall: {
    /** Times a model answer was revealed. */
    reveals: number;
    /** Items with a rating, by their latest rating. */
    again: number;
    hard: number;
    good: number;
    easy: number;
  };
  flashcards: {
    cards: number;
    /** Cards reviewed at least once. */
    reviewed: number;
    lapses: number;
    /** Reviews in the last 30 days, and the share not rated Again (null without reviews). */
    reviews30: number;
    retention30: number | null;
  };
  reviewLater: number;
}

export interface WeeklyStudy {
  /** Teaching week of the semester, counted in 7-day blocks from the first day. */
  week: number;
  start: IsoDate;
  minutes: number;
}

export interface TopicRow {
  topic: string;
  answered: number;
  correct: number;
  accuracy: number;
}

export interface LectureRow {
  id: string;
  number: number;
  title: string;
  weekNumber: number;
  completed: boolean;
  studyMinutes: number;
  mcqAnswered: number;
  mcqAccuracy: number | null;
  weakRecall: number;
  lapses: number;
}

export interface CourseRow {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  colorToken: string | null;
  lectures: number;
  completedLectures: number;
  studyMinutes: number;
  mcqAnswered: number;
  mcqAccuracy: number | null;
}

export interface SemesterStatistics {
  metrics: ScopeMetrics;
  weekly: WeeklyStudy[];
  /** Consecutive days with study, ending today or yesterday. */
  streakDays: number;
  /** Days with study among the last seven. */
  daysStudiedLast7: number;
  courses: CourseRow[];
  upcoming: {
    exams: { title: string; date: IsoDate; days: number }[];
    flashcardsDue7: number;
  };
}

export interface CourseStatistics {
  course: { id: string; slug: string; name: string; shortName: string; colorToken: string | null };
  metrics: ScopeMetrics;
  weekly: WeeklyStudy[];
  topics: TopicRow[];
  lectures: LectureRow[];
  weaknesses: Weakness[];
  difficult: { id: string; label: string }[];
}

export interface LectureStatistics {
  metrics: ScopeMetrics;
  topics: TopicRow[];
  weaknesses: Weakness[];
}

export function createStatisticsAccess(db: Database, userId: string) {
  const calendar = createCalendarAccess(db, userId);

  async function metrics(scope: SignalScope, now: Date): Promise<ScopeMetrics> {
    const lectureWhere = and(
      eq(lectures.userId, userId),
      scope.courseId ? eq(lectures.courseId, scope.courseId) : undefined,
      scope.lectureId ? eq(lectures.id, scope.lectureId) : undefined,
    );
    const sessionWhere = and(
      eq(studySessions.userId, userId),
      scope.courseId ? eq(studySessions.courseId, scope.courseId) : undefined,
      scope.lectureId ? eq(studySessions.lectureId, scope.lectureId) : undefined,
    );
    const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const cardWhere = flashcardScope(userId, scope);

    const [[completion], [study], questions, recall, [reveals], [cards], [reviews], reviewLater] =
      await Promise.all([
        db
          .select({
            lectures: sql<number>`count(*)::int`,
            completed: sql<number>`count(${lectureProgress.completedAt})::int`,
          })
          .from(lectures)
          .leftJoin(lectureProgress, eq(lectureProgress.lectureId, lectures.id))
          .where(lectureWhere),
        db
          .select({
            seconds: sql<number>`coalesce(sum(${studySessions.activeSeconds}), 0)::int`,
            sessions: sql<number>`count(*)::int`,
          })
          .from(studySessions)
          .where(and(sessionWhere, isNotNull(studySessions.endedAt))),
        mcqQuestionStats(db, userId, scope),
        latestRecall(db, userId, scope),
        db
          .select({ n: count() })
          .from(questionBankAttempts)
          .innerJoin(resources, eq(resources.id, questionBankAttempts.resourceId))
          .innerJoin(lectures, eq(lectures.id, resources.lectureId))
          .where(and(eq(questionBankAttempts.userId, userId), lectureWhere)),
        db
          .select({
            cards: sql<number>`count(*)::int`,
            reviewed: sql<number>`(count(*) filter (where ${flashcards.reps} > 0))::int`,
            lapses: sql<number>`coalesce(sum(${flashcards.lapses}), 0)::int`,
          })
          .from(flashcards)
          .innerJoin(flashcardDecks, eq(flashcardDecks.id, flashcards.deckId))
          .leftJoin(resources, eq(resources.id, flashcards.sourceResourceId))
          .where(cardWhere),
        db
          .select({
            total: sql<number>`count(*)::int`,
            remembered: sql<number>`(count(*) filter (where ${flashcardReviews.rating} <> 'again'))::int`,
          })
          .from(flashcardReviews)
          .innerJoin(flashcards, eq(flashcards.id, flashcardReviews.cardId))
          .innerJoin(flashcardDecks, eq(flashcardDecks.id, flashcards.deckId))
          .leftJoin(resources, eq(resources.id, flashcards.sourceResourceId))
          .where(and(cardWhere, gte(flashcardReviews.reviewedAt, since30))),
        reviewLaterByLecture(db, userId, scope),
      ]);

    const answered = questions.reduce((total, question) => total + question.answered, 0);
    const correct = questions.reduce((total, question) => total + question.correct, 0);
    const sum = (key: "again" | "hard" | "good" | "easy") =>
      recall.reduce((total, bank) => total + bank[key], 0);
    return {
      lectures: completion?.lectures ?? 0,
      completedLectures: completion?.completed ?? 0,
      studySeconds: study?.seconds ?? 0,
      sessions: study?.sessions ?? 0,
      mcq: {
        answered,
        correct,
        accuracy: share(correct, answered),
        questions: questions.length,
        repeatedErrors: questions.filter((question) => question.answered - question.correct >= 2)
          .length,
      },
      recall: {
        reveals: reveals?.n ?? 0,
        again: sum("again"),
        hard: sum("hard"),
        good: sum("good"),
        easy: sum("easy"),
      },
      flashcards: {
        cards: cards?.cards ?? 0,
        reviewed: cards?.reviewed ?? 0,
        lapses: cards?.lapses ?? 0,
        reviews30: reviews?.total ?? 0,
        retention30: share(reviews?.remembered ?? 0, reviews?.total ?? 0),
      },
      reviewLater: reviewLater.reduce((total, row) => total + row.count, 0),
    };
  }

  /** Finished study per teaching week of the semester, from its first week to its last. */
  async function weekly(scope: SignalScope): Promise<WeeklyStudy[]> {
    const rows = await db
      .select({ startedAt: studySessions.startedAt, seconds: studySessions.activeSeconds })
      .from(studySessions)
      .where(
        and(
          eq(studySessions.userId, userId),
          isNotNull(studySessions.endedAt),
          scope.courseId ? eq(studySessions.courseId, scope.courseId) : undefined,
        ),
      );
    const term = CURRENT_SEMESTER.term;
    const total = Math.floor(daysBetween(term.start, term.end) / 7) + 1;
    const seconds = new Array<number>(total).fill(0);
    for (const row of rows) {
      const week = semesterWeekFor(zonedDate(row.startedAt, ZONE));
      if (week !== null && week <= total) seconds[week - 1]! += row.seconds;
    }
    return seconds.map((value, index) => ({
      week: index + 1,
      start: addDays(term.start, index * 7),
      minutes: Math.floor(value / 60),
    }));
  }

  function topicRows(questions: Awaited<ReturnType<typeof mcqQuestionStats>>): TopicRow[] {
    const totals = new Map<string, TopicRow>();
    for (const question of questions) {
      if (!question.topic) continue;
      const key = question.topic.toLowerCase();
      const row = totals.get(key) ?? {
        topic: question.topic,
        answered: 0,
        correct: 0,
        accuracy: 0,
      };
      row.answered += question.answered;
      row.correct += question.correct;
      totals.set(key, row);
    }
    return [...totals.values()]
      .map((row) => ({ ...row, accuracy: share(row.correct, row.answered) ?? 0 }))
      .sort((a, b) => a.accuracy - b.accuracy || a.topic.localeCompare(b.topic));
  }

  async function weaknesses(scope: SignalScope): Promise<Weakness[]> {
    const lectureRows = await db
      .select({ id: lectures.id, courseId: lectures.courseId, title: lectures.title })
      .from(lectures)
      .where(
        and(
          eq(lectures.userId, userId),
          scope.courseId ? eq(lectures.courseId, scope.courseId) : undefined,
          scope.lectureId ? eq(lectures.id, scope.lectureId) : undefined,
        ),
      );
    const [questions, recall, reviewLater, lapses, difficult] = await Promise.all([
      mcqQuestionStats(db, userId, scope),
      latestRecall(db, userId, scope),
      reviewLaterByLecture(db, userId, scope),
      lapsesByLecture(db, userId, scope),
      scope.lectureId
        ? Promise.resolve([])
        : db
            .select({
              id: difficultConcepts.id,
              courseId: difficultConcepts.courseId,
              label: difficultConcepts.label,
            })
            .from(difficultConcepts)
            .where(
              and(
                eq(difficultConcepts.userId, userId),
                scope.courseId ? eq(difficultConcepts.courseId, scope.courseId) : undefined,
              ),
            ),
    ]);
    const byLecture = <T extends { lectureId: string }>(rows: T[], value: (row: T) => number) => {
      const totals = new Map<string, number>();
      for (const row of rows)
        totals.set(row.lectureId, (totals.get(row.lectureId) ?? 0) + value(row));
      return totals;
    };
    const weakRecall = byLecture(recall, (bank) => bank.again + bank.hard);
    const later = byLecture(reviewLater, (row) => row.count);
    const lapsed = byLecture(lapses, (row) => row.lapses);
    return detectWeaknesses({
      questions,
      lectures: lectureRows.map((lecture) => ({
        lectureId: lecture.id,
        courseId: lecture.courseId,
        title: lecture.title,
        flashcardLapses: lapsed.get(lecture.id) ?? 0,
        weakRecall: weakRecall.get(lecture.id) ?? 0,
        reviewLater: later.get(lecture.id) ?? 0,
      })),
      difficult,
    });
  }

  async function ownCourse(courseId: string) {
    if (!isId(courseId)) return null;
    const [course] = await db
      .select({
        id: courses.id,
        slug: courses.slug,
        name: courses.name,
        shortName: courses.shortName,
        colorToken: courses.colorToken,
      })
      .from(courses)
      .where(and(eq(courses.id, courseId), eq(courses.userId, userId)));
    return course ?? null;
  }

  return {
    async semester(now = new Date()): Promise<SemesterStatistics> {
      const today = zonedDate(now, ZONE);
      const [all, weeklyStudy, sessionDays, courseList, upcoming, [due]] = await Promise.all([
        metrics({}, now),
        weekly({}),
        db
          .select({ startedAt: studySessions.startedAt })
          .from(studySessions)
          .where(
            and(
              eq(studySessions.userId, userId),
              isNotNull(studySessions.endedAt),
              gte(studySessions.activeSeconds, 60),
            ),
          ),
        db
          .select({
            id: courses.id,
            slug: courses.slug,
            name: courses.name,
            shortName: courses.shortName,
            colorToken: courses.colorToken,
          })
          .from(courses)
          .innerJoin(semesters, eq(semesters.id, courses.semesterId))
          .where(and(eq(courses.userId, userId), eq(semesters.slug, CURRENT_SEMESTER.id)))
          .orderBy(asc(courses.position)),
        calendar.exams.upcoming(now),
        db
          .select({ n: count() })
          .from(flashcards)
          .innerJoin(flashcardDecks, eq(flashcardDecks.id, flashcards.deckId))
          .leftJoin(resources, eq(resources.id, flashcards.sourceResourceId))
          .where(
            and(
              flashcardScope(userId),
              lt(flashcards.due, new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)),
            ),
          ),
      ]);

      // Streak and consistency: days with at least a minute of finished study.
      const studied = new Set(sessionDays.map((row) => zonedDate(row.startedAt, ZONE)));
      let day = studied.has(today) ? today : addDays(today, -1);
      let streakDays = 0;
      while (studied.has(day)) {
        streakDays += 1;
        day = addDays(day, -1);
      }
      let daysStudiedLast7 = 0;
      for (let back = 0; back < 7; back += 1) {
        if (studied.has(addDays(today, -back))) daysStudiedLast7 += 1;
      }

      const perCourse = await Promise.all(
        courseList.map(async (course) => {
          const scoped = await metrics({ courseId: course.id }, now);
          return {
            ...course,
            lectures: scoped.lectures,
            completedLectures: scoped.completedLectures,
            studyMinutes: Math.floor(scoped.studySeconds / 60),
            mcqAnswered: scoped.mcq.answered,
            mcqAccuracy: scoped.mcq.accuracy,
          };
        }),
      );

      const exams = [
        ...upcoming.flatMap((exam) =>
          exam.exam ? [{ title: exam.title, date: zonedDate(exam.startsAt, ZONE) }] : [],
        ),
        { title: "Midterm period", date: CURRENT_SEMESTER.midterms.start },
        { title: "Final examination period", date: CURRENT_SEMESTER.finals.start },
      ]
        .map((exam) => ({ ...exam, days: daysBetween(today, exam.date) }))
        .filter((exam) => exam.days >= 0 && exam.days <= 28)
        .sort((a, b) => a.days - b.days || a.title.localeCompare(b.title));

      return {
        metrics: all,
        weekly: weeklyStudy,
        streakDays,
        daysStudiedLast7,
        courses: perCourse,
        upcoming: { exams, flashcardsDue7: due?.n ?? 0 },
      };
    },

    async course(courseId: string, now = new Date()): Promise<CourseStatistics | null> {
      const course = await ownCourse(courseId);
      if (!course) return null;
      const scope = { courseId };
      const [scoped, weeklyStudy, questions, found, lectureList, difficult] = await Promise.all([
        metrics(scope, now),
        weekly(scope),
        mcqQuestionStats(db, userId, scope),
        weaknesses(scope),
        db
          .select({
            id: lectures.id,
            number: lectures.number,
            title: lectures.title,
            weekNumber: weeks.number,
            completedAt: lectureProgress.completedAt,
          })
          .from(lectures)
          .innerJoin(weeks, eq(weeks.id, lectures.weekId))
          .leftJoin(lectureProgress, eq(lectureProgress.lectureId, lectures.id))
          .where(and(eq(lectures.userId, userId), eq(lectures.courseId, courseId)))
          .orderBy(asc(weeks.number), asc(lectures.number)),
        db
          .select({ id: difficultConcepts.id, label: difficultConcepts.label })
          .from(difficultConcepts)
          .where(
            and(eq(difficultConcepts.userId, userId), eq(difficultConcepts.courseId, courseId)),
          )
          .orderBy(sql`lower(${difficultConcepts.label})`),
      ]);

      const ids = lectureList.map((lecture) => lecture.id);
      const [studyRows, recall, lapses] = await Promise.all([
        ids.length === 0
          ? Promise.resolve([])
          : db
              .select({
                lectureId: studySessions.lectureId,
                seconds: sql<number>`coalesce(sum(${studySessions.activeSeconds}), 0)::int`,
              })
              .from(studySessions)
              .where(
                and(
                  eq(studySessions.userId, userId),
                  isNotNull(studySessions.endedAt),
                  inArray(studySessions.lectureId, ids),
                ),
              )
              .groupBy(studySessions.lectureId),
        latestRecall(db, userId, scope),
        lapsesByLecture(db, userId, scope),
      ]);
      const secondsBy = new Map(studyRows.map((row) => [row.lectureId, row.seconds]));
      const lectureRows: LectureRow[] = lectureList.map((lecture) => {
        const own = questions.filter((question) => question.lectureId === lecture.id);
        const answered = own.reduce((total, question) => total + question.answered, 0);
        const correct = own.reduce((total, question) => total + question.correct, 0);
        return {
          id: lecture.id,
          number: lecture.number,
          title: lecture.title,
          weekNumber: lecture.weekNumber,
          completed: lecture.completedAt !== null,
          studyMinutes: Math.floor((secondsBy.get(lecture.id) ?? 0) / 60),
          mcqAnswered: answered,
          mcqAccuracy: share(correct, answered),
          weakRecall: recall
            .filter((bank) => bank.lectureId === lecture.id)
            .reduce((total, bank) => total + bank.again + bank.hard, 0),
          lapses: lapses
            .filter((row) => row.lectureId === lecture.id)
            .reduce((total, row) => total + row.lapses, 0),
        };
      });

      return {
        course,
        metrics: scoped,
        weekly: weeklyStudy,
        topics: topicRows(questions),
        lectures: lectureRows,
        weaknesses: found,
        difficult,
      };
    },

    async lecture(lectureId: string, now = new Date()): Promise<LectureStatistics | null> {
      if (!isId(lectureId)) return null;
      const [own] = await db
        .select({ id: lectures.id })
        .from(lectures)
        .where(and(eq(lectures.id, lectureId), eq(lectures.userId, userId)));
      if (!own) return null;
      const scope = { lectureId };
      const [scoped, questions, found] = await Promise.all([
        metrics(scope, now),
        mcqQuestionStats(db, userId, scope),
        weaknesses(scope),
      ]);
      return { metrics: scoped, topics: topicRows(questions), weaknesses: found };
    },

    /** Weaknesses across the semester, or within one course. */
    weaknesses(courseId?: string): Promise<Weakness[]> {
      if (courseId !== undefined && !isId(courseId)) return Promise.resolve([]);
      return weaknesses(courseId ? { courseId } : {});
    },

    difficult: {
      /** Marks a concept of a course as difficult, in the user's words. */
      async add(courseId: string, label: string): Promise<{ id: string } | null> {
        const text = label.trim().replace(/\s+/g, " ");
        if (text.length === 0 || text.length > MAX_CONCEPT_LABEL) return null;
        if (!(await ownCourse(courseId))) return null;
        await db
          .insert(difficultConcepts)
          .values({ userId, courseId, label: text })
          .onConflictDoNothing();
        const [row] = await db
          .select({ id: difficultConcepts.id })
          .from(difficultConcepts)
          .where(
            and(
              eq(difficultConcepts.userId, userId),
              eq(difficultConcepts.courseId, courseId),
              sql`lower(btrim(${difficultConcepts.label})) = lower(${text})`,
            ),
          );
        return row ?? null;
      },

      async remove(conceptId: string): Promise<boolean> {
        if (!isId(conceptId)) return false;
        const removed = await db
          .delete(difficultConcepts)
          .where(and(eq(difficultConcepts.id, conceptId), eq(difficultConcepts.userId, userId)))
          .returning({ id: difficultConcepts.id });
        return removed.length > 0;
      },
    },
  };
}
