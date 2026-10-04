import { type McqQuestion, validateContent } from "@medos/parsers/model";
import {
  CURRENT_SEMESTER,
  DEFAULT_STUDY_AVAILABILITY,
  type IsoDate,
  type StudyAvailability,
  addDays,
  availableMinutesFor,
  isIsoDate,
  semesterWeekRange,
  zonedInstant,
} from "@medos/shared";
import { type PlannerSignals, type PlanSuggestion, suggestPlan } from "@medos/study-engine";
import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";

import type { Database } from "../client";
import {
  type DailyPlan,
  type DailyPlanItem,
  type PlanItemSource,
  type PlanItemStatus,
  STUDY_ACTIVITIES,
  type StudyActivity,
  calendarEvents,
  courses,
  dailyPlanItems,
  dailyPlans,
  lectureProgress,
  lectures,
  mcqAttempts,
  originalLectureAnnotations,
  questionBankAttempts,
  questionReviewItems,
  resourceContents,
  resources,
  semesters,
  studyGuideAnnotations,
  studySessions,
  userSettings,
  weeks,
} from "../schema";

import { createCalendarAccess } from "./calendar";
import { createFlashcardAccess } from "./flashcards";

/*
 * The study planner at the trusted boundary. It gathers the user's study
 * signals, asks the engine (`@medos/study-engine`) for a plan, and stores it.
 * A day is planned once: after that the plan is the user's, changed only by
 * them. "Refresh suggestions" replaces only suggestions the user has not
 * touched. Nothing here changes lecture completion.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (value: string) => UUID.test(value);

const ZONE = CURRENT_SEMESTER.timeZone;
export const MIN_ITEM_MINUTES = 5;
export const MAX_ITEM_MINUTES = 720;
export const MAX_ITEM_TITLE = 200;
const VISIBLE: readonly PlanItemStatus[] = ["planned", "done"];

export interface PlanItemView {
  id: string;
  position: number;
  source: PlanItemSource;
  status: PlanItemStatus;
  edited: boolean;
  activity: StudyActivity;
  title: string;
  minutes: number;
  score: number | null;
  reasons: string[];
  postponedFrom: string | null;
  resourceId: string | null;
  course: {
    id: string;
    slug: string;
    name: string;
    shortName: string;
    colorToken: string | null;
  } | null;
  lecture: { id: string; number: number; title: string } | null;
}

export interface DailyPlanView {
  date: IsoDate;
  availableMinutes: number;
  /** Minutes of planned and done items. */
  plannedMinutes: number;
  /** Planned and done items, in the user's order. */
  items: PlanItemView[];
  /** Suggestions the user removed or postponed today. */
  setAside: number;
}

export interface NewPlanItem {
  activity: StudyActivity;
  title: string;
  minutes: number;
  courseId?: string | null;
  lectureId?: string | null;
}

type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

const dayBounds = (date: IsoDate) => ({
  start: zonedInstant(date, "00:00", ZONE),
  end: zonedInstant(addDays(date, 1), "00:00", ZONE),
});

const validMinutes = (minutes: number) =>
  Number.isInteger(minutes) && minutes >= MIN_ITEM_MINUTES && minutes <= MAX_ITEM_MINUTES;

export function createPlannerAccess(db: Database, userId: string) {
  const flashcards = createFlashcardAccess(db, userId);
  const calendar = createCalendarAccess(db, userId);

  async function availability(): Promise<StudyAvailability & { custom: boolean }> {
    const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
    return row
      ? { weekdayMinutes: row.weekdayMinutes, weekendMinutes: row.weekendMinutes, custom: true }
      : { ...DEFAULT_STUDY_AVAILABILITY, custom: false };
  }

  /** The user's courses of the current semester. */
  async function semesterCourses() {
    return db
      .select({
        id: courses.id,
        name: courses.name,
        shortName: courses.shortName,
        slug: courses.slug,
      })
      .from(courses)
      .innerJoin(semesters, eq(semesters.id, courses.semesterId))
      .where(and(eq(courses.userId, userId), eq(semesters.slug, CURRENT_SEMESTER.id)))
      .orderBy(asc(courses.position));
  }

  /** Every signal the planner considers, for one day. */
  async function signals(date: IsoDate, now: Date): Promise<PlannerSignals> {
    const day = dayBounds(date);
    const [settings, ownCourses] = await Promise.all([availability(), semesterCourses()]);
    const courseIds = ownCourses.map((course) => course.id);
    if (courseIds.length === 0) {
      return {
        date,
        availableMinutes: availableMinutesFor(date, settings),
        courses: [],
        lecturedToday: [],
        incompleteLectures: [],
        flashcardsDue: [],
        mcqTopics: [],
        weakRecall: [],
        reviewLater: [],
        exams: [],
        recentMinutes: [],
      };
    }

    // Courses with a lecture on today's timetable.
    const lecturedRows = await db
      .selectDistinct({ courseId: calendarEvents.courseId })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.userId, userId),
          eq(calendarEvents.type, "lecture"),
          gte(calendarEvents.startsAt, day.start),
          lt(calendarEvents.startsAt, day.end),
        ),
      );

    // Lectures not marked complete, already given (their week has begun).
    const lectureRows = await db
      .select({
        lectureId: lectures.id,
        courseId: lectures.courseId,
        title: lectures.title,
        number: lectures.number,
        heldOn: lectures.heldOn,
        weekNumber: weeks.number,
        weekStartsOn: weeks.startsOn,
        studyGuides: sql<number>`(select count(*)::int from ${resources} where ${resources.lectureId} = ${lectures.id} and ${resources.kind} = 'study-guide')`,
      })
      .from(lectures)
      .innerJoin(weeks, eq(weeks.id, lectures.weekId))
      .leftJoin(lectureProgress, eq(lectureProgress.lectureId, lectures.id))
      .where(
        and(
          eq(lectures.userId, userId),
          inArray(lectures.courseId, courseIds),
          isNull(lectureProgress.completedAt),
        ),
      )
      .orderBy(asc(lectures.courseId), asc(weeks.number), asc(lectures.number));
    const incompleteLectures = lectureRows.flatMap((row) => {
      const given = (row.heldOn ??
        row.weekStartsOn ??
        semesterWeekRange(row.weekNumber).start) as IsoDate;
      if (given > date) return [];
      return [
        {
          lectureId: row.lectureId,
          courseId: row.courseId,
          title: row.title,
          weekNumber: row.weekNumber,
          heldOn: given,
          hasStudyGuide: row.studyGuides > 0,
        },
      ];
    });

    // Flashcards ready today, by the same queue the review screen uses.
    const flashcardsDue = (
      await Promise.all(
        courseIds.map(async (courseId) => {
          const queue = await flashcards.review.queue({ courseId }, { now, dayStart: day.start });
          return { courseId, due: queue?.cards.length ?? 0 };
        }),
      )
    ).filter((entry) => entry.due > 0);

    // MCQ accuracy by topic: scored attempts matched to their question's topic.
    const attemptRows = await db
      .select({
        resourceId: mcqAttempts.resourceId,
        fingerprint: mcqAttempts.questionFingerprint,
        answered: sql<number>`count(*)::int`,
        correct: sql<number>`(count(*) filter (where ${mcqAttempts.correct}))::int`,
      })
      .from(mcqAttempts)
      .where(and(eq(mcqAttempts.userId, userId), isNotNull(mcqAttempts.correct)))
      .groupBy(mcqAttempts.resourceId, mcqAttempts.questionFingerprint);
    const mcqTopics: PlannerSignals["mcqTopics"][number][] = [];
    const quizIds = [...new Set(attemptRows.map((row) => row.resourceId))];
    if (quizIds.length > 0) {
      const quizzes = await db
        .select({
          resourceId: resources.id,
          lectureId: resources.lectureId,
          courseId: lectures.courseId,
          content: resourceContents.content,
        })
        .from(resources)
        .innerJoin(lectures, eq(lectures.id, resources.lectureId))
        .innerJoin(resourceContents, eq(resourceContents.resourceId, resources.id))
        .where(and(eq(resources.userId, userId), inArray(resources.id, quizIds)));
      for (const quiz of quizzes) {
        const content = validateContent(quiz.content);
        if (content.format !== "mcq-set") continue;
        const topicOf = new Map(
          content.questions.map((question: McqQuestion) => [question.fingerprint, question.topic]),
        );
        const byTopic = new Map<string, { answered: number; correct: number }>();
        for (const row of attemptRows) {
          if (row.resourceId !== quiz.resourceId) continue;
          const topic = topicOf.get(row.fingerprint);
          if (!topic) continue;
          const total = byTopic.get(topic) ?? { answered: 0, correct: 0 };
          total.answered += row.answered;
          total.correct += row.correct;
          byTopic.set(topic, total);
        }
        for (const [topic, total] of byTopic) {
          mcqTopics.push({
            courseId: quiz.courseId,
            lectureId: quiz.lectureId,
            resourceId: quiz.resourceId,
            topic,
            ...total,
          });
        }
      }
    }

    // Question Bank items whose most recent rating was Again or Hard.
    const latestRatings = db
      .selectDistinctOn([questionBankAttempts.resourceId, questionBankAttempts.itemFingerprint], {
        resourceId: questionBankAttempts.resourceId,
        rating: questionBankAttempts.rating,
      })
      .from(questionBankAttempts)
      .where(and(eq(questionBankAttempts.userId, userId), isNotNull(questionBankAttempts.rating)))
      .orderBy(
        questionBankAttempts.resourceId,
        questionBankAttempts.itemFingerprint,
        sql`${questionBankAttempts.ratedAt} desc`,
      )
      .as("latest");
    const weakRows = await db
      .select({
        resourceId: latestRatings.resourceId,
        lectureId: resources.lectureId,
        courseId: lectures.courseId,
        count: sql<number>`count(*)::int`,
      })
      .from(latestRatings)
      .innerJoin(resources, eq(resources.id, latestRatings.resourceId))
      .innerJoin(lectures, eq(lectures.id, resources.lectureId))
      .where(sql`${latestRatings.rating} in ('again', 'hard')`)
      .groupBy(latestRatings.resourceId, resources.lectureId, lectures.courseId);

    // Review Later items per course, from Study Guides, lecture PDFs and questions.
    const reviewLaterCounts = new Map<string, number>();
    const countInto = (rows: { courseId: string; count: number }[]) => {
      for (const row of rows) {
        reviewLaterCounts.set(row.courseId, (reviewLaterCounts.get(row.courseId) ?? 0) + row.count);
      }
    };
    const courseCount = { courseId: lectures.courseId, count: sql<number>`count(*)::int` };
    countInto(
      await db
        .select(courseCount)
        .from(studyGuideAnnotations)
        .innerJoin(resources, eq(resources.id, studyGuideAnnotations.resourceId))
        .innerJoin(lectures, eq(lectures.id, resources.lectureId))
        .where(
          and(
            eq(studyGuideAnnotations.userId, userId),
            eq(studyGuideAnnotations.kind, "review-later"),
          ),
        )
        .groupBy(lectures.courseId),
    );
    countInto(
      await db
        .select(courseCount)
        .from(originalLectureAnnotations)
        .innerJoin(resources, eq(resources.id, originalLectureAnnotations.resourceId))
        .innerJoin(lectures, eq(lectures.id, resources.lectureId))
        .where(
          and(
            eq(originalLectureAnnotations.userId, userId),
            eq(originalLectureAnnotations.kind, "review-later"),
          ),
        )
        .groupBy(lectures.courseId),
    );
    countInto(
      await db
        .select(courseCount)
        .from(questionReviewItems)
        .innerJoin(resources, eq(resources.id, questionReviewItems.resourceId))
        .innerJoin(lectures, eq(lectures.id, resources.lectureId))
        .where(eq(questionReviewItems.userId, userId))
        .groupBy(lectures.courseId),
    );

    // Exams: the user's course exams, and the midterm and final periods for every course.
    const upcoming = await calendar.exams.upcoming(day.start);
    const exams: PlannerSignals["exams"] = [
      ...upcoming.flatMap((exam) => {
        if (!exam.course || !exam.exam) return [];
        const examDate = zonedDate(exam.startsAt);
        const label =
          exam.exam.kind === "midterm"
            ? "Midterm exam"
            : exam.exam.kind === "final"
              ? "Final exam"
              : "Exam";
        return [{ courseId: exam.course.id, label, date: examDate }];
      }),
      { courseId: null, label: "Midterm period", date: CURRENT_SEMESTER.midterms.start },
      { courseId: null, label: "Final examination period", date: CURRENT_SEMESTER.finals.start },
    ];

    // Active study per course over the last seven days.
    const recentRows = await db
      .select({
        courseId: studySessions.courseId,
        seconds: sql<number>`coalesce(sum(${studySessions.activeSeconds}), 0)::int`,
      })
      .from(studySessions)
      .where(
        and(
          eq(studySessions.userId, userId),
          isNotNull(studySessions.courseId),
          gte(studySessions.startedAt, new Date(day.start.getTime() - 7 * 24 * 60 * 60 * 1000)),
        ),
      )
      .groupBy(studySessions.courseId);
    const recentByCourse = new Map(recentRows.map((row) => [row.courseId, row.seconds]));

    return {
      date,
      availableMinutes: availableMinutesFor(date, settings),
      courses: ownCourses.map(({ id, name, shortName }) => ({ id, name, shortName })),
      lecturedToday: lecturedRows.flatMap((row) => (row.courseId ? [row.courseId] : [])),
      incompleteLectures,
      flashcardsDue,
      mcqTopics,
      weakRecall: weakRows,
      reviewLater: [...reviewLaterCounts].map(([courseId, count]) => ({ courseId, count })),
      exams,
      recentMinutes: courseIds.map((courseId) => ({
        courseId,
        minutes: Math.floor((recentByCourse.get(courseId) ?? 0) / 60),
      })),
    };
  }

  /** The day's plan row, created if needed. */
  async function planRow(executor: Executor, date: IsoDate): Promise<DailyPlan> {
    await executor.insert(dailyPlans).values({ userId, date }).onConflictDoNothing();
    const [plan] = await executor
      .select()
      .from(dailyPlans)
      .where(and(eq(dailyPlans.userId, userId), eq(dailyPlans.date, date)));
    if (!plan) throw new Error("The plan could not be created.");
    return plan;
  }

  async function itemsOf(executor: Executor, planId: string): Promise<DailyPlanItem[]> {
    return executor
      .select()
      .from(dailyPlanItems)
      .where(and(eq(dailyPlanItems.planId, planId), eq(dailyPlanItems.userId, userId)))
      .orderBy(asc(dailyPlanItems.position), asc(dailyPlanItems.createdAt));
  }

  /** Adds the engine's suggestions after the plan's existing items, within the time left. */
  async function addSuggestions(plan: DailyPlan, now: Date): Promise<void> {
    const day = await signals(plan.date as IsoDate, now);
    const existing = await itemsOf(db, plan.id);
    const used = existing
      .filter((item) => VISIBLE.includes(item.status))
      .reduce((total, item) => total + item.minutes, 0);
    const exclude = new Set(
      existing.flatMap((item) => (item.suggestionKey ? [item.suggestionKey] : [])),
    );
    const suggestions = suggestPlan(
      { ...day, availableMinutes: Math.max(0, day.availableMinutes - used) },
      { exclude },
    );
    let position = existing.reduce((max, item) => Math.max(max, item.position), -1);
    if (suggestions.length === 0) return;
    await db.insert(dailyPlanItems).values(
      suggestions.map((suggestion: PlanSuggestion) => ({
        userId,
        planId: plan.id,
        position: (position += 1),
        source: "suggested" as const,
        suggestionKey: suggestion.key,
        activity: suggestion.activity,
        courseId: suggestion.courseId,
        lectureId: suggestion.lectureId,
        resourceId: suggestion.resourceId,
        title: suggestion.title.slice(0, MAX_ITEM_TITLE),
        minutes: Math.max(MIN_ITEM_MINUTES, suggestion.minutes),
        score: suggestion.score,
        reasons: suggestion.reasons,
      })),
    );
  }

  async function view(date: IsoDate): Promise<DailyPlanView> {
    const settings = await availability();
    const plan = await db.query.dailyPlans.findFirst({
      where: and(eq(dailyPlans.userId, userId), eq(dailyPlans.date, date)),
      with: {
        items: {
          orderBy: [asc(dailyPlanItems.position), asc(dailyPlanItems.createdAt)],
          with: {
            course: {
              columns: { id: true, slug: true, name: true, shortName: true, colorToken: true },
            },
            lecture: { columns: { id: true, number: true, title: true } },
          },
        },
      },
    });
    const all = plan?.items ?? [];
    const visible = all.filter((item) => VISIBLE.includes(item.status));
    return {
      date,
      availableMinutes: availableMinutesFor(date, settings),
      plannedMinutes: visible.reduce((total, item) => total + item.minutes, 0),
      items: visible.map((item) => ({
        id: item.id,
        position: item.position,
        source: item.source,
        status: item.status,
        edited: item.edited,
        activity: item.activity,
        title: item.title,
        minutes: item.minutes,
        score: item.score,
        reasons: item.reasons,
        postponedFrom: item.postponedFrom,
        resourceId: item.resourceId,
        course: item.course ?? null,
        lecture: item.lecture ?? null,
      })),
      setAside: all.filter((item) => item.source === "suggested" && !VISIBLE.includes(item.status))
        .length,
    };
  }

  /** An item of the user's, with its plan's date; null when it is not theirs. */
  async function ownItem(itemId: string) {
    if (!isId(itemId)) return null;
    const [row] = await db
      .select({ item: dailyPlanItems, date: dailyPlans.date })
      .from(dailyPlanItems)
      .innerJoin(dailyPlans, eq(dailyPlans.id, dailyPlanItems.planId))
      .where(and(eq(dailyPlanItems.id, itemId), eq(dailyPlanItems.userId, userId)));
    return row ? { ...row.item, date: row.date as IsoDate } : null;
  }

  async function ownContext(courseId: string | null, lectureId: string | null) {
    if (lectureId) {
      if (!isId(lectureId)) return null;
      const [lecture] = await db
        .select({ courseId: lectures.courseId })
        .from(lectures)
        .where(and(eq(lectures.id, lectureId), eq(lectures.userId, userId)));
      if (!lecture || (courseId && courseId !== lecture.courseId)) return null;
      return { courseId: lecture.courseId, lectureId };
    }
    if (courseId) {
      if (!isId(courseId)) return null;
      const [course] = await db
        .select({ id: courses.id })
        .from(courses)
        .where(and(eq(courses.id, courseId), eq(courses.userId, userId)));
      return course ? { courseId, lectureId: null } : null;
    }
    return { courseId: null, lectureId: null };
  }

  return {
    settings: {
      get: availability,

      async setAvailability(input: StudyAvailability): Promise<boolean> {
        const valid = (value: number) => Number.isInteger(value) && value >= 0 && value <= 1440;
        if (!valid(input.weekdayMinutes) || !valid(input.weekendMinutes)) return false;
        await db
          .insert(userSettings)
          .values({ userId, ...input })
          .onConflictDoUpdate({ target: userSettings.userId, set: input });
        return true;
      },
    },

    /** The signals behind a day's suggestions, for showing how the plan was made. */
    signals,

    /** A day's plan as it stands, without suggesting anything (for past days). */
    async get(date: IsoDate): Promise<DailyPlanView | null> {
      return isIsoDate(date) ? view(date) : null;
    },

    /**
     * The day's plan. The first time a day is opened the planner proposes
     * items for it; after that it is never rebuilt on its own.
     */
    async forDate(date: IsoDate, now = new Date()): Promise<DailyPlanView | null> {
      if (!isIsoDate(date)) return null;
      const plan = await planRow(db, date);
      if (plan.suggestedAt === null) {
        // Claim the day, so two requests at once cannot both suggest.
        const [claimed] = await db
          .update(dailyPlans)
          .set({ suggestedAt: now })
          .where(and(eq(dailyPlans.id, plan.id), isNull(dailyPlans.suggestedAt)))
          .returning();
        if (claimed) await addSuggestions(claimed, now);
      }
      return view(date);
    },

    /** Replaces the suggestions the user has not touched with fresh ones. */
    async refresh(date: IsoDate, now = new Date()): Promise<DailyPlanView | null> {
      if (!isIsoDate(date)) return null;
      const plan = await planRow(db, date);
      await db
        .delete(dailyPlanItems)
        .where(
          and(
            eq(dailyPlanItems.planId, plan.id),
            eq(dailyPlanItems.userId, userId),
            eq(dailyPlanItems.source, "suggested"),
            eq(dailyPlanItems.edited, false),
            eq(dailyPlanItems.status, "planned"),
          ),
        );
      await db.update(dailyPlans).set({ suggestedAt: now }).where(eq(dailyPlans.id, plan.id));
      await addSuggestions(plan, now);
      return view(date);
    },

    /** Removes every remaining suggestion, leaving only the user's own items. */
    async clearSuggestions(date: IsoDate): Promise<DailyPlanView | null> {
      if (!isIsoDate(date)) return null;
      const plan = await planRow(db, date);
      await db
        .update(dailyPlanItems)
        .set({ status: "dismissed" })
        .where(
          and(
            eq(dailyPlanItems.planId, plan.id),
            eq(dailyPlanItems.userId, userId),
            eq(dailyPlanItems.source, "suggested"),
            eq(dailyPlanItems.status, "planned"),
          ),
        );
      if (plan.suggestedAt === null) {
        await db
          .update(dailyPlans)
          .set({ suggestedAt: new Date() })
          .where(eq(dailyPlans.id, plan.id));
      }
      return view(date);
    },

    items: {
      /** Adds an item of the user's own at the end of the day's plan. */
      async add(date: IsoDate, input: NewPlanItem): Promise<PlanItemView | null> {
        if (!isIsoDate(date) || !STUDY_ACTIVITIES.includes(input.activity)) return null;
        const title = input.title.trim();
        if (title.length === 0 || title.length > MAX_ITEM_TITLE || !validMinutes(input.minutes))
          return null;
        const context = await ownContext(input.courseId ?? null, input.lectureId ?? null);
        if (!context) return null;
        const plan = await planRow(db, date);
        const existing = await itemsOf(db, plan.id);
        const [row] = await db
          .insert(dailyPlanItems)
          .values({
            userId,
            planId: plan.id,
            position: existing.reduce((max, item) => Math.max(max, item.position), -1) + 1,
            source: "manual",
            activity: input.activity,
            ...context,
            title,
            minutes: input.minutes,
          })
          .returning({ id: dailyPlanItems.id });
        return (await view(date)).items.find((item) => item.id === row?.id) ?? null;
      },

      /** Changes an item's title or duration; a changed suggestion is kept on refresh. */
      async update(itemId: string, input: { title?: string; minutes?: number }): Promise<boolean> {
        const item = await ownItem(itemId);
        if (!item) return false;
        const title = input.title?.trim();
        if (title !== undefined && (title.length === 0 || title.length > MAX_ITEM_TITLE))
          return false;
        if (input.minutes !== undefined && !validMinutes(input.minutes)) return false;
        await db
          .update(dailyPlanItems)
          .set({
            ...(title ? { title } : {}),
            ...(input.minutes ? { minutes: input.minutes } : {}),
            edited: true,
          })
          .where(and(eq(dailyPlanItems.id, itemId), eq(dailyPlanItems.userId, userId)));
        return true;
      },

      /**
       * Puts the day's planned and done items in the given order. The ids must
       * be exactly the day's visible items. Moved suggestions count as edited.
       */
      async reorder(date: IsoDate, itemIds: readonly string[]): Promise<boolean> {
        if (!isIsoDate(date)) return false;
        const [plan] = await db
          .select()
          .from(dailyPlans)
          .where(and(eq(dailyPlans.userId, userId), eq(dailyPlans.date, date)));
        if (!plan) return false;
        const visible = (await itemsOf(db, plan.id)).filter((item) =>
          VISIBLE.includes(item.status),
        );
        const ids = new Set(itemIds);
        if (
          ids.size !== itemIds.length ||
          ids.size !== visible.length ||
          visible.some((item) => !ids.has(item.id))
        ) {
          return false;
        }
        const before = new Map(visible.map((item, index) => [item.id, index]));
        await db.transaction(async (tx) => {
          for (const [index, id] of itemIds.entries()) {
            const moved = before.get(id) !== index;
            await tx
              .update(dailyPlanItems)
              .set(moved ? { position: index, edited: true } : { position: index })
              .where(and(eq(dailyPlanItems.id, id), eq(dailyPlanItems.userId, userId)));
          }
        });
        return true;
      },

      /** Ticks an item off, or back on. Never marks a lecture complete. */
      async setDone(itemId: string, done: boolean): Promise<boolean> {
        const item = await ownItem(itemId);
        if (!item || !VISIBLE.includes(item.status)) return false;
        await db
          .update(dailyPlanItems)
          .set({ status: done ? "done" : "planned", edited: true })
          .where(and(eq(dailyPlanItems.id, itemId), eq(dailyPlanItems.userId, userId)));
        return true;
      },

      /** Removes an item. A suggestion is set aside so it is not proposed again that day. */
      async remove(itemId: string): Promise<boolean> {
        const item = await ownItem(itemId);
        if (!item) return false;
        if (item.source === "manual") {
          await db
            .delete(dailyPlanItems)
            .where(and(eq(dailyPlanItems.id, itemId), eq(dailyPlanItems.userId, userId)));
        } else {
          await db
            .update(dailyPlanItems)
            .set({ status: "dismissed" })
            .where(and(eq(dailyPlanItems.id, itemId), eq(dailyPlanItems.userId, userId)));
        }
        return true;
      },

      /** Moves an item to the next day's plan, at its end. */
      async postpone(itemId: string): Promise<boolean> {
        const item = await ownItem(itemId);
        if (!item || item.status !== "planned") return false;
        const next = addDays(item.date, 1);
        await db.transaction(async (tx) => {
          const plan = await planRow(tx, next);
          const existing = await itemsOf(tx, plan.id);
          await tx
            .update(dailyPlanItems)
            .set({ status: "postponed" })
            .where(and(eq(dailyPlanItems.id, itemId), eq(dailyPlanItems.userId, userId)));
          await tx.insert(dailyPlanItems).values({
            userId,
            planId: plan.id,
            position: existing.reduce((max, entry) => Math.max(max, entry.position), -1) + 1,
            source: item.source === "manual" ? "manual" : "postponed",
            suggestionKey: item.source === "manual" ? null : item.suggestionKey,
            activity: item.activity,
            courseId: item.courseId,
            lectureId: item.lectureId,
            resourceId: item.resourceId,
            title: item.title,
            minutes: item.minutes,
            score: item.score,
            reasons: item.reasons,
            postponedFrom: item.date,
          });
        });
        return true;
      },
    },
  };
}

function zonedDate(instant: Date): IsoDate {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}` as IsoDate;
}
