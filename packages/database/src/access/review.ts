import {
  type McqQuestion,
  type ParsedContent,
  type QuestionBankItem,
  blocksText,
  plainText,
  resolveAnchor,
  unitText,
  validateContent,
} from "@medos/parsers/model";
import { and, asc, eq, inArray } from "drizzle-orm";

import type { Database } from "../client";
import {
  type AnnotationKind,
  type QuestionReviewItem,
  courses,
  lectures,
  originalLectureAnnotations,
  questionReviewItems,
  resourceContents,
  resources,
  studyGuideAnnotations,
  weeks,
} from "../schema";

/*
 * Review Later on questions, and the annotation hub: everything the user
 * marked across Study Guides, original lectures, MCQs and Question Banks, in
 * one read-only list with where each item came from.
 *
 * The hub never changes an item. An item whose source is gone after a
 * re-import (an orphan) stays listed and is labelled, never silently
 * re-attached to something else. Nothing here affects lecture completion.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QUESTION_KEY = /^q[0-9]+$/;
const isId = (value: string) => UUID.test(value);

export const MAX_REVIEW_NOTE_LENGTH = 10_000;
/** Characters of a question shown in the hub. */
const EXCERPT_LENGTH = 280;

export type QuestionSource = "mcq" | "question-bank";
export type HubSource = "study-guide" | "original-lecture" | QuestionSource;

/** Where an item opens. Absent for an orphan, which cannot be opened. */
export type HubTarget =
  | { kind: "study-guide"; annotationId: string }
  | { kind: "original-lecture"; page: number }
  | { kind: "mcq"; questionKey: string }
  | { kind: "question-bank"; questionKey: string };

export interface HubItem {
  id: string;
  source: HubSource;
  kind: AnnotationKind;
  resourceId: string;
  originalFilename: string;
  /** The words the item is about: a quoted passage, a page, or a question. */
  excerpt: string;
  /** Where in the resource: a section heading, "Page 12", "Question 3". */
  location: string | null;
  /** The user's own words, when they wrote any. */
  note: string | null;
  /** Null when the source of the item no longer exists. */
  target: HubTarget | null;
  createdAt: Date;
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

interface ResourceContext {
  originalFilename: string;
  content: ParsedContent | null;
  lecture: HubItem["lecture"];
  week: HubItem["week"];
  course: HubItem["course"];
}

export type QuestionReviewView = Pick<
  QuestionReviewItem,
  "id" | "resourceId" | "questionKey" | "note" | "createdAt"
>;

const truncate = (text: string) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > EXCERPT_LENGTH ? `${flat.slice(0, EXCERPT_LENGTH - 1)}…` : flat;
};

/** A question by key, or, after a re-import renumbered it, by fingerprint. */
function findQuestion<T extends { key: string; fingerprint: string }>(
  questions: readonly T[],
  key: string,
  fingerprint: string,
): T | null {
  const byKey = questions.find((question) => question.key === key);
  if (byKey?.fingerprint === fingerprint) return byKey;
  return questions.find((question) => question.fingerprint === fingerprint) ?? null;
}

const questionText = (question: McqQuestion | QuestionBankItem) =>
  "stem" in question ? plainText(question.stem) : blocksText(question.prompt);

const questionLabel = (question: McqQuestion | QuestionBankItem) =>
  question.number === null ? null : `Question ${question.number}`;

export function createReviewAccess(db: Database, userId: string) {
  /** The user's quiz or question bank with its questions, or null. */
  async function loadQuestions(
    resourceId: string,
  ): Promise<readonly (McqQuestion | QuestionBankItem)[] | null> {
    if (!isId(resourceId)) return null;
    const row = await db.query.resources.findFirst({
      where: and(eq(resources.id, resourceId), eq(resources.userId, userId)),
      columns: { id: true, kind: true },
      with: { content: { columns: { content: true } } },
    });
    if (!row?.content || (row.kind !== "mcq" && row.kind !== "question-bank")) return null;
    const content = validateContent(row.content.content);
    if (content.format === "mcq-set") return content.questions;
    if (content.format === "question-bank") return content.items;
    return null;
  }

  /** Each resource with its course, week and lecture, for the given resources. */
  async function contexts(resourceIds: string[]): Promise<Map<string, ResourceContext>> {
    if (resourceIds.length === 0) return new Map();
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
        content: resourceContents.content,
      })
      .from(resources)
      .innerJoin(lectures, and(eq(lectures.id, resources.lectureId), eq(lectures.userId, userId)))
      .innerJoin(weeks, and(eq(weeks.id, lectures.weekId), eq(weeks.userId, userId)))
      .innerJoin(courses, and(eq(courses.id, lectures.courseId), eq(courses.userId, userId)))
      .leftJoin(
        resourceContents,
        and(eq(resourceContents.resourceId, resources.id), eq(resourceContents.userId, userId)),
      )
      .where(and(eq(resources.userId, userId), inArray(resources.id, resourceIds)));
    return new Map(
      rows.map((row) => [
        row.resourceId,
        {
          originalFilename: row.originalFilename,
          content: row.content ? validateContent(row.content) : null,
          lecture: { id: row.lectureId, number: row.lectureNumber, title: row.lectureTitle },
          week: { number: row.weekNumber },
          course: {
            slug: row.courseSlug,
            name: row.courseName,
            shortName: row.courseShortName,
            colorToken: row.courseColor,
            position: row.coursePosition,
          },
        },
      ]),
    );
  }

  return {
    questions: {
      /** The questions of a quiz or bank the user marked Review Later, by current key. */
      async list(resourceId: string): Promise<QuestionReviewView[]> {
        const questions = await loadQuestions(resourceId);
        if (!questions) return [];
        const rows = await db
          .select()
          .from(questionReviewItems)
          .where(
            and(
              eq(questionReviewItems.resourceId, resourceId),
              eq(questionReviewItems.userId, userId),
            ),
          )
          .orderBy(asc(questionReviewItems.createdAt));
        const views: QuestionReviewView[] = [];
        for (const row of rows) {
          const question = findQuestion(questions, row.questionKey, row.questionFingerprint);
          if (!question) continue;
          views.push({
            id: row.id,
            resourceId: row.resourceId,
            questionKey: question.key,
            note: row.note,
            createdAt: row.createdAt,
          });
        }
        return views;
      },

      /**
       * Marks a question Review Later (or changes its note). Null when the
       * quiz or bank is not the user's, the question does not exist or the
       * note is unusable. Marking the same question twice keeps one item.
       */
      async add(
        resourceId: string,
        questionKey: string,
        note: string | null = null,
      ): Promise<QuestionReviewView | null> {
        if (!QUESTION_KEY.test(questionKey)) return null;
        const trimmed = note?.trim() ? note.trim() : null;
        if (trimmed && trimmed.length > MAX_REVIEW_NOTE_LENGTH) return null;
        const questions = await loadQuestions(resourceId);
        const question = questions?.find((candidate) => candidate.key === questionKey);
        if (!question) return null;
        const [row] = await db
          .insert(questionReviewItems)
          .values({
            userId,
            resourceId,
            questionKey,
            questionFingerprint: question.fingerprint,
            note: trimmed,
          })
          .onConflictDoUpdate({
            target: [questionReviewItems.resourceId, questionReviewItems.questionKey],
            set: { questionFingerprint: question.fingerprint, note: trimmed },
            setWhere: eq(questionReviewItems.userId, userId),
          })
          .returning();
        return row
          ? {
              id: row.id,
              resourceId: row.resourceId,
              questionKey: row.questionKey,
              note: row.note,
              createdAt: row.createdAt,
            }
          : null;
      },

      /** Removes a question's Review Later item ("done"). False if there was none. */
      async remove(resourceId: string, questionKey: string): Promise<boolean> {
        if (!isId(resourceId) || !QUESTION_KEY.test(questionKey)) return false;
        const removed = await db
          .delete(questionReviewItems)
          .where(
            and(
              eq(questionReviewItems.resourceId, resourceId),
              eq(questionReviewItems.questionKey, questionKey),
              eq(questionReviewItems.userId, userId),
            ),
          )
          .returning({ id: questionReviewItems.id });
        return removed.length > 0;
      },

      /** Removes a Review Later item by its id, including an orphaned one. */
      async removeById(itemId: string): Promise<boolean> {
        if (!isId(itemId)) return false;
        const removed = await db
          .delete(questionReviewItems)
          .where(and(eq(questionReviewItems.id, itemId), eq(questionReviewItems.userId, userId)))
          .returning({ id: questionReviewItems.id });
        return removed.length > 0;
      },
    },

    /**
     * Every highlight, note, bookmark and Review Later item of the user, with
     * its course, week and lecture, newest first. Read-only.
     */
    async hub(): Promise<HubItem[]> {
      const [guideRows, pageRows, questionRows] = await Promise.all([
        db.select().from(studyGuideAnnotations).where(eq(studyGuideAnnotations.userId, userId)),
        db
          .select()
          .from(originalLectureAnnotations)
          .where(eq(originalLectureAnnotations.userId, userId)),
        db.select().from(questionReviewItems).where(eq(questionReviewItems.userId, userId)),
      ]);
      const context = await contexts([
        ...new Set([...guideRows, ...pageRows, ...questionRows].map((row) => row.resourceId)),
      ]);

      const items: HubItem[] = [];
      const place = (resourceId: string) => {
        const found = context.get(resourceId);
        if (!found) return null;
        const { content, ...where } = found;
        return { content, where: { resourceId, ...where } };
      };

      for (const row of guideRows) {
        const found = place(row.resourceId);
        if (!found) continue;
        const { content, where } = found;
        const document = content?.format === "study-guide" ? content : null;
        const resolved = document
          ? resolveAnchor(document, {
              sectionId: row.sectionId,
              unitPath: row.unitPath,
              start: row.startOffset,
              end: row.endOffset,
              quote: row.quote,
              prefix: row.prefix,
              suffix: row.suffix,
            })
          : ({ status: "orphaned" } as const);
        const section =
          resolved.status === "orphaned"
            ? null
            : document?.sections.find((candidate) => candidate.id === resolved.sectionId);
        items.push({
          ...where,
          id: row.id,
          source: "study-guide",
          kind: row.kind,
          excerpt: truncate(row.quote),
          location: section ? unitText(section.heading) : null,
          note: row.note,
          target:
            resolved.status === "orphaned" ? null : { kind: "study-guide", annotationId: row.id },
          createdAt: row.createdAt,
        });
      }

      for (const row of pageRows) {
        const found = place(row.resourceId);
        if (!found) continue;
        const { content, where } = found;
        const exists = content?.format === "pdf" && row.page <= content.pageCount;
        items.push({
          ...where,
          id: row.id,
          source: "original-lecture",
          kind: row.kind,
          excerpt: `Page ${row.page}`,
          location: null,
          note: row.note,
          target: exists ? { kind: "original-lecture", page: row.page } : null,
          createdAt: row.createdAt,
        });
      }

      for (const row of questionRows) {
        const found = place(row.resourceId);
        if (!found) continue;
        const { content, where } = found;
        const source: QuestionSource =
          content?.format === "question-bank" ? "question-bank" : "mcq";
        const questions: readonly (McqQuestion | QuestionBankItem)[] =
          content?.format === "mcq-set"
            ? content.questions
            : content?.format === "question-bank"
              ? content.items
              : [];
        const question = findQuestion(questions, row.questionKey, row.questionFingerprint);
        items.push({
          ...where,
          id: row.id,
          source,
          kind: "review-later",
          excerpt: question
            ? truncate(questionText(question))
            : "This question is no longer in the file.",
          location: question ? questionLabel(question) : null,
          note: row.note,
          target: question ? { kind: source, questionKey: question.key } : null,
          createdAt: row.createdAt,
        });
      }

      return items.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id),
      );
    },
  };
}
