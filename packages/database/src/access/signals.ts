import { type McqQuestion, validateContent } from "@medos/parsers/model";
import type { QuestionStat } from "@medos/study-engine";
import { type SQL, and, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";

import type { Database } from "../client";
import {
  flashcardDecks,
  flashcards,
  lectures,
  mcqAttempts,
  originalLectureAnnotations,
  questionBankAttempts,
  questionReviewItems,
  resourceContents,
  resources,
  studyGuideAnnotations,
} from "../schema";

/*
 * Study signals read from the user's own activity, shared by the planner and
 * the statistics so both count the same things the same way. Every query is
 * scoped to one user, and optionally to one course or lecture.
 */

export interface SignalScope {
  courseId?: string;
  lectureId?: string;
}

/** Conditions limiting a lecture column to the scope. */
function lectureScope(scope: SignalScope): SQL | undefined {
  return and(
    scope.courseId ? eq(lectures.courseId, scope.courseId) : undefined,
    scope.lectureId ? eq(lectures.id, scope.lectureId) : undefined,
  );
}

/**
 * Every scored MCQ question the user has answered, with how often and how
 * often correctly, and its topic as the parsed quiz states it.
 */
export async function mcqQuestionStats(
  db: Database,
  userId: string,
  scope: SignalScope = {},
): Promise<QuestionStat[]> {
  const rows = await db
    .select({
      resourceId: mcqAttempts.resourceId,
      lectureId: resources.lectureId,
      courseId: lectures.courseId,
      fingerprint: mcqAttempts.questionFingerprint,
      answered: sql<number>`count(*)::int`,
      correct: sql<number>`(count(*) filter (where ${mcqAttempts.correct}))::int`,
    })
    .from(mcqAttempts)
    .innerJoin(resources, eq(resources.id, mcqAttempts.resourceId))
    .innerJoin(lectures, eq(lectures.id, resources.lectureId))
    .where(and(eq(mcqAttempts.userId, userId), isNotNull(mcqAttempts.correct), lectureScope(scope)))
    .groupBy(
      mcqAttempts.resourceId,
      resources.lectureId,
      lectures.courseId,
      mcqAttempts.questionFingerprint,
    );
  if (rows.length === 0) return [];

  const quizIds = [...new Set(rows.map((row) => row.resourceId))];
  const contents = await db
    .select({ resourceId: resourceContents.resourceId, content: resourceContents.content })
    .from(resourceContents)
    .where(and(eq(resourceContents.userId, userId), inArray(resourceContents.resourceId, quizIds)));
  const topicOf = new Map<string, string | null>();
  for (const row of contents) {
    const content = validateContent(row.content);
    if (content.format !== "mcq-set") continue;
    for (const question of content.questions as McqQuestion[]) {
      topicOf.set(`${row.resourceId}|${question.fingerprint}`, question.topic?.trim() || null);
    }
  }
  return rows.map((row) => ({
    ...row,
    topic: topicOf.get(`${row.resourceId}|${row.fingerprint}`) ?? null,
  }));
}

/** Question Bank items by their latest rating, per bank. */
export async function latestRecall(db: Database, userId: string, scope: SignalScope = {}) {
  const latest = db
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
  return db
    .select({
      resourceId: latest.resourceId,
      lectureId: resources.lectureId,
      courseId: lectures.courseId,
      again: sql<number>`(count(*) filter (where ${latest.rating} = 'again'))::int`,
      hard: sql<number>`(count(*) filter (where ${latest.rating} = 'hard'))::int`,
      good: sql<number>`(count(*) filter (where ${latest.rating} = 'good'))::int`,
      easy: sql<number>`(count(*) filter (where ${latest.rating} = 'easy'))::int`,
    })
    .from(latest)
    .innerJoin(resources, eq(resources.id, latest.resourceId))
    .innerJoin(lectures, eq(lectures.id, resources.lectureId))
    .where(lectureScope(scope))
    .groupBy(latest.resourceId, resources.lectureId, lectures.courseId);
}

/** Review Later items per lecture: Study Guide passages, PDF pages and questions. */
export async function reviewLaterByLecture(db: Database, userId: string, scope: SignalScope = {}) {
  const count = {
    lectureId: lectures.id,
    courseId: lectures.courseId,
    count: sql<number>`count(*)::int`,
  };
  const groups = await Promise.all([
    db
      .select(count)
      .from(studyGuideAnnotations)
      .innerJoin(resources, eq(resources.id, studyGuideAnnotations.resourceId))
      .innerJoin(lectures, eq(lectures.id, resources.lectureId))
      .where(
        and(
          eq(studyGuideAnnotations.userId, userId),
          eq(studyGuideAnnotations.kind, "review-later"),
          lectureScope(scope),
        ),
      )
      .groupBy(lectures.id, lectures.courseId),
    db
      .select(count)
      .from(originalLectureAnnotations)
      .innerJoin(resources, eq(resources.id, originalLectureAnnotations.resourceId))
      .innerJoin(lectures, eq(lectures.id, resources.lectureId))
      .where(
        and(
          eq(originalLectureAnnotations.userId, userId),
          eq(originalLectureAnnotations.kind, "review-later"),
          lectureScope(scope),
        ),
      )
      .groupBy(lectures.id, lectures.courseId),
    db
      .select(count)
      .from(questionReviewItems)
      .innerJoin(resources, eq(resources.id, questionReviewItems.resourceId))
      .innerJoin(lectures, eq(lectures.id, resources.lectureId))
      .where(and(eq(questionReviewItems.userId, userId), lectureScope(scope)))
      .groupBy(lectures.id, lectures.courseId),
  ]);
  const totals = new Map<string, { lectureId: string; courseId: string; count: number }>();
  for (const row of groups.flat()) {
    const total = totals.get(row.lectureId) ?? { ...row, count: 0 };
    total.count += row.count;
    totals.set(row.lectureId, total);
  }
  return [...totals.values()];
}

/**
 * The lecture a flashcard belongs to: its deck's lecture, or the lecture of
 * the Study Guide it was made from. Null for a card of a course deck made by hand.
 */
export const cardLecture = sql<
  string | null
>`coalesce(${flashcardDecks.lectureId}, ${resources.lectureId})`;

/**
 * Flashcards in scope: not deleted, and in the course, or belonging to the
 * lecture. Use with `flashcards` joined to its deck and its source resource.
 */
export function flashcardScope(userId: string, scope: SignalScope = {}): SQL | undefined {
  return and(
    eq(flashcards.userId, userId),
    isNull(flashcards.deletedAt),
    scope.courseId ? eq(flashcardDecks.courseId, scope.courseId) : undefined,
    scope.lectureId
      ? or(eq(flashcardDecks.lectureId, scope.lectureId), eq(resources.lectureId, scope.lectureId))
      : undefined,
  );
}

/** Flashcard lapses per lecture. */
export async function lapsesByLecture(db: Database, userId: string, scope: SignalScope = {}) {
  const rows = await db
    .select({
      lectureId: cardLecture,
      courseId: flashcardDecks.courseId,
      lapses: sql<number>`coalesce(sum(${flashcards.lapses}), 0)::int`,
    })
    .from(flashcards)
    .innerJoin(flashcardDecks, eq(flashcardDecks.id, flashcards.deckId))
    .leftJoin(resources, eq(resources.id, flashcards.sourceResourceId))
    .where(flashcardScope(userId, scope))
    .groupBy(cardLecture, flashcardDecks.courseId);
  return rows.flatMap((row) => (row.lectureId ? [{ ...row, lectureId: row.lectureId }] : []));
}
