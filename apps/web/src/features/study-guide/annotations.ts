import {
  ANNOTATION_KINDS,
  MAX_NOTE_LENGTH,
  MAX_QUOTE_LENGTH,
  type ReadingProgressView,
  type UserScope,
} from "@medos/database";
import { z } from "zod";

/*
 * The reader's actions on the user's own layer over a study guide, kept
 * apart from the Server Function wrappers so they can be tested directly.
 *
 * Input from the browser is untrusted: it is parsed here, then checked
 * against the guide's own text by the user-scoped data layer. Whose data
 * changes is decided by the scope alone, which comes from the verified
 * session; anything else the browser sends (such as a user id) is discarded.
 *
 * None of these actions changes lecture completion.
 */

const sectionId = z.string().max(200).nullable();

const createInput = z.object({
  resourceId: z.uuid(),
  kind: z.enum(ANNOTATION_KINDS),
  sectionId,
  unitPath: z.string().max(200).nullable(),
  start: z.number().int().nonnegative().nullable(),
  end: z.number().int().positive().nullable(),
  quote: z.string().max(MAX_QUOTE_LENGTH).nullable(),
  note: z.string().max(MAX_NOTE_LENGTH).nullable().optional(),
});

const noteInput = z.object({ annotationId: z.uuid(), note: z.string().max(MAX_NOTE_LENGTH) });
const removeInput = z.object({ annotationId: z.uuid() });
const progressInput = z.object({ resourceId: z.uuid(), sectionId: z.string().max(200) });

export type ActionResult<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

export const MESSAGES = {
  notFound: "This Study Guide could not be found.",
  mismatch:
    "The selected text does not match the Study Guide as it is now. Reload the page and try again.",
  invalid: "This could not be saved. Select text within one paragraph, item or cell and try again.",
  emptyNote: "Write something in the note before saving it.",
  annotationMissing: "This item could not be found. It may already have been removed.",
} as const;

export async function createAnnotation(
  scope: UserScope,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.invalid };
  const { resourceId, ...annotation } = parsed.data;
  if (annotation.kind === "note" && !annotation.note?.trim()) {
    return { ok: false, error: MESSAGES.emptyNote };
  }

  const result = await scope.studyGuides.annotations.create(resourceId, annotation);
  if (result.ok) return { ok: true, value: { id: result.annotation.id } };
  switch (result.reason) {
    case "not-found":
      return { ok: false, error: MESSAGES.notFound };
    case "text-mismatch":
      return { ok: false, error: MESSAGES.mismatch };
    case "invalid":
      return { ok: false, error: MESSAGES.invalid };
  }
}

export async function updateAnnotationNote(
  scope: UserScope,
  input: unknown,
): Promise<ActionResult> {
  const parsed = noteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.invalid };
  if (!parsed.data.note.trim()) return { ok: false, error: MESSAGES.emptyNote };
  const updated = await scope.studyGuides.annotations.updateNote(
    parsed.data.annotationId,
    parsed.data.note,
  );
  return updated
    ? { ok: true, value: undefined }
    : { ok: false, error: MESSAGES.annotationMissing };
}

export async function removeAnnotation(scope: UserScope, input: unknown): Promise<ActionResult> {
  const parsed = removeInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.annotationMissing };
  const removed = await scope.studyGuides.annotations.remove(parsed.data.annotationId);
  return removed
    ? { ok: true, value: undefined }
    : { ok: false, error: MESSAGES.annotationMissing };
}

/** Reading progress as sent to the browser (dates as strings). */
export type ProgressSnapshot = Omit<ReadingProgressView, "updatedAt">;

export function progressSnapshot(view: ReadingProgressView): ProgressSnapshot {
  const { updatedAt: _updatedAt, ...rest } = view;
  return rest;
}

/** Records that the end of a section was reached. Never changes lecture completion. */
export async function recordReadingProgress(
  scope: UserScope,
  input: unknown,
): Promise<ActionResult<ProgressSnapshot>> {
  const parsed = progressInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.notFound };
  const view = await scope.studyGuides.progress.record(
    parsed.data.resourceId,
    parsed.data.sectionId,
  );
  return view
    ? { ok: true, value: progressSnapshot(view) }
    : { ok: false, error: MESSAGES.notFound };
}
