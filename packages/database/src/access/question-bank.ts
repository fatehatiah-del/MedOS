import { type QuestionBank, type QuestionBankItem, validateContent } from "@medos/parsers/model";
import { and, asc, count, countDistinct, eq } from "drizzle-orm";

import type { Database } from "../client";
import {
  type QuestionBankAttempt,
  type RecallRating,
  courses,
  lectures,
  questionBankAttempts,
  resources,
  weeks,
} from "../schema";

/*
 * Question Bank active recall at the trusted boundary. A model answer is only
 * ever handed out by `reveal`, which records the attempt first. Every reveal
 * is its own attempt; ratings are the user's own judgement. A bank or attempt
 * that is not the user's behaves exactly like one that does not exist.
 * Nothing here changes lecture completion.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (value: string) => UUID.test(value);

export const MAX_TYPED_ANSWER_LENGTH = 10_000;
const MAX_ITEM_TIME_MS = 60 * 60 * 1000;

export interface QuestionBankView {
  resourceId: string;
  lectureId: string;
  originalFilename: string;
  bank: QuestionBank;
  /** False when the file changed after these items were read from it. */
  current: boolean;
}

/** A bank as listed on the Question Bank page, with where it belongs. */
export interface BankOverview {
  resourceId: string;
  originalFilename: string;
  title: string | null;
  itemCount: number;
  /** Items the user has revealed at least once. */
  practised: number;
  lecture: { id: string; number: number; title: string };
  week: { number: number };
  course: {
    slug: string;
    name: string;
    shortName: string;
    colorToken: string | null;
    position: number;
  };
}

export type RevealResult =
  | { ok: true; attempt: QuestionBankAttempt; item: QuestionBankItem }
  | { ok: false; reason: "not-found" | "invalid" };

export function createQuestionBankAccess(db: Database, userId: string) {
  async function load(resourceId: string): Promise<QuestionBankView | null> {
    if (!isId(resourceId)) return null;
    const row = await db.query.resources.findFirst({
      where: and(eq(resources.id, resourceId), eq(resources.userId, userId)),
      columns: { id: true, lectureId: true, kind: true, originalFilename: true, contentHash: true },
      with: { content: { columns: { content: true, sourceContentHash: true } } },
    });
    if (!row || row.kind !== "question-bank" || !row.content) return null;
    const bank = validateContent(row.content.content);
    if (bank.format !== "question-bank") return null;
    return {
      resourceId: row.id,
      lectureId: row.lectureId,
      originalFilename: row.originalFilename,
      bank,
      current: row.content.sourceContentHash === row.contentHash,
    };
  }

  async function history(resourceId: string): Promise<QuestionBankAttempt[]> {
    if (!isId(resourceId)) return [];
    return db
      .select()
      .from(questionBankAttempts)
      .where(
        and(
          eq(questionBankAttempts.resourceId, resourceId),
          eq(questionBankAttempts.userId, userId),
        ),
      )
      .orderBy(asc(questionBankAttempts.revealedAt), asc(questionBankAttempts.createdAt));
  }

  return {
    get: load,
    history,

    /**
     * Reveals an item's model answer: records the attempt (with whatever the
     * user typed), then returns the item. The answer is never handed out
     * without an attempt being recorded.
     */
    async reveal(
      resourceId: string,
      input: { key: string; typedAnswer: string | null; timeMs: number },
      now = new Date(),
    ): Promise<RevealResult> {
      const view = await load(resourceId);
      if (!view) return { ok: false, reason: "not-found" };
      const item = view.bank.items.find((candidate) => candidate.key === input.key);
      if (!item) return { ok: false, reason: "invalid" };
      const typed = input.typedAnswer?.trim() ? input.typedAnswer.trim() : null;
      if (typed && typed.length > MAX_TYPED_ANSWER_LENGTH) return { ok: false, reason: "invalid" };

      const [previous] = await db
        .select({ n: count() })
        .from(questionBankAttempts)
        .where(
          and(
            eq(questionBankAttempts.userId, userId),
            eq(questionBankAttempts.resourceId, resourceId),
            eq(questionBankAttempts.itemFingerprint, item.fingerprint),
          ),
        );
      const timeSpentMs = Number.isFinite(input.timeMs)
        ? Math.min(Math.max(Math.round(input.timeMs), 0), MAX_ITEM_TIME_MS)
        : 0;
      const [attempt] = await db
        .insert(questionBankAttempts)
        .values({
          userId,
          resourceId,
          itemKey: item.key,
          itemFingerprint: item.fingerprint,
          typedAnswer: typed,
          revealedAt: now,
          timeSpentMs,
          attemptNumber: (previous?.n ?? 0) + 1,
        })
        .returning();
      return attempt ? { ok: true, attempt, item } : { ok: false, reason: "invalid" };
    },

    /** Records (or changes) the user's own rating of an attempt. */
    async rate(
      attemptId: string,
      rating: RecallRating,
      now = new Date(),
    ): Promise<QuestionBankAttempt | null> {
      if (!isId(attemptId)) return null;
      const [updated] = await db
        .update(questionBankAttempts)
        .set({ rating, ratedAt: now })
        .where(and(eq(questionBankAttempts.id, attemptId), eq(questionBankAttempts.userId, userId)))
        .returning();
      return updated ?? null;
    },

    /** The user's banks with their course, week and lecture, and how much is practised. */
    async banks(): Promise<BankOverview[]> {
      const rows = await db
        .select({
          resourceId: resources.id,
          originalFilename: resources.originalFilename,
          lectureId: lectures.id,
          lectureNumber: lectures.number,
          lectureTitle: lectures.title,
          weekNumber: weeks.number,
          courseSlug: courses.slug,
          courseName: courses.name,
          courseShortName: courses.shortName,
          courseColor: courses.colorToken,
          coursePosition: courses.position,
        })
        .from(resources)
        .innerJoin(lectures, and(eq(lectures.id, resources.lectureId), eq(lectures.userId, userId)))
        .innerJoin(weeks, and(eq(weeks.id, lectures.weekId), eq(weeks.userId, userId)))
        .innerJoin(courses, and(eq(courses.id, lectures.courseId), eq(courses.userId, userId)))
        .where(and(eq(resources.userId, userId), eq(resources.kind, "question-bank")))
        .orderBy(asc(courses.position), asc(weeks.number), asc(lectures.number));

      const practised = await db
        .select({
          resourceId: questionBankAttempts.resourceId,
          n: countDistinct(questionBankAttempts.itemFingerprint),
        })
        .from(questionBankAttempts)
        .where(eq(questionBankAttempts.userId, userId))
        .groupBy(questionBankAttempts.resourceId);
      const practisedBy = new Map(practised.map((row) => [row.resourceId, row.n]));

      const overviews: BankOverview[] = [];
      for (const row of rows) {
        const view = await load(row.resourceId);
        if (!view) continue;
        overviews.push({
          resourceId: row.resourceId,
          originalFilename: row.originalFilename,
          title: view.bank.title,
          itemCount: view.bank.items.length,
          practised: Math.min(practisedBy.get(row.resourceId) ?? 0, view.bank.items.length),
          lecture: { id: row.lectureId, number: row.lectureNumber, title: row.lectureTitle },
          week: { number: row.weekNumber },
          course: {
            slug: row.courseSlug,
            name: row.courseName,
            shortName: row.courseShortName,
            colorToken: row.courseColor,
            position: row.coursePosition,
          },
        });
      }
      return overviews;
    },
  };
}
