import { type HubItem, MAX_REVIEW_NOTE_LENGTH, type UserScope } from "@medos/database";
import { z } from "zod";

import {
  mcqHref,
  originalLectureHref,
  questionBankHref,
  studyGuideHref,
} from "@/features/courses/progress";

/*
 * Review Later on questions and the annotation hub, kept apart from the
 * Server Function wrappers so they can be tested directly. Input from the
 * browser is untrusted; whose data it is comes only from the scope. Removing
 * an item is the user marking it done. Nothing here changes lecture
 * completion.
 */

export type ActionResult<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

export const MESSAGES = {
  notFound: "This question could not be found. Reload the page and try again.",
  invalid: "This could not be saved. Reload the page and try again.",
  tooLong: "Your note is too long to save. Shorten it and try again.",
  itemMissing: "This item could not be found. It may already be removed.",
} as const;

const KEY = z.string().regex(/^q[0-9]+$/);

const questionInput = z.object({
  resourceId: z.uuid(),
  questionKey: KEY,
  marked: z.boolean(),
  note: z.string().nullable().optional(),
});

const removeInput = z.object({
  source: z.enum(["study-guide", "original-lecture", "mcq", "question-bank"]),
  id: z.uuid(),
});

const practiseInput = z.object({ resourceId: z.uuid(), questionKey: KEY });

/** Marks a question Review Later, or removes the mark. */
export async function setQuestionReview(
  scope: UserScope,
  input: unknown,
): Promise<ActionResult<{ marked: boolean }>> {
  const parsed = questionInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.invalid };
  const { resourceId, questionKey, marked, note } = parsed.data;
  if (!marked) {
    await scope.review.questions.remove(resourceId, questionKey);
    return { ok: true, value: { marked: false } };
  }
  if ((note?.trim().length ?? 0) > MAX_REVIEW_NOTE_LENGTH) {
    return { ok: false, error: MESSAGES.tooLong };
  }
  const item = await scope.review.questions.add(resourceId, questionKey, note ?? null);
  return item ? { ok: true, value: { marked: true } } : { ok: false, error: MESSAGES.notFound };
}

/** Removes any item listed in the hub: the user is done with it. */
export async function removeHubItem(scope: UserScope, input: unknown): Promise<ActionResult> {
  const parsed = removeInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.invalid };
  const { source, id } = parsed.data;
  const removed =
    source === "study-guide"
      ? await scope.studyGuides.annotations.remove(id)
      : source === "original-lecture"
        ? await scope.originalLectures.annotations.remove(id)
        : await scope.review.questions.removeById(id);
  return removed ? { ok: true, value: undefined } : { ok: false, error: MESSAGES.itemMissing };
}

/**
 * Opens an MCQ from Review Later: a Learn session of that one question, so
 * the answer and explanation follow straight away. Returns the session's id.
 */
export async function practiseQuestion(
  scope: UserScope,
  input: unknown,
): Promise<ActionResult<{ sessionId: string }>> {
  const parsed = practiseInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.invalid };
  const session = await scope.mcq.sessions.start(parsed.data.resourceId, {
    mode: "learn",
    keys: [parsed.data.questionKey],
    shuffled: false,
    timeLimitSeconds: null,
  });
  return session
    ? { ok: true, value: { sessionId: session.id } }
    : { ok: false, error: MESSAGES.notFound };
}

/** Where a hub item opens, or null for an orphan. MCQs open through `practiseQuestion`. */
export function hubItemHref(item: HubItem): string | null {
  const { target, course, lecture, resourceId } = item;
  if (!target) return null;
  switch (target.kind) {
    case "study-guide":
      return `${studyGuideHref(course.slug, lecture.id, resourceId)}?annotation=${target.annotationId}`;
    case "original-lecture":
      return `${originalLectureHref(course.slug, lecture.id, resourceId)}?page=${target.page}`;
    case "question-bank":
      return `${questionBankHref(course.slug, lecture.id, resourceId)}?item=${target.questionKey}`;
    case "mcq":
      return mcqHref(course.slug, lecture.id, resourceId);
  }
}
