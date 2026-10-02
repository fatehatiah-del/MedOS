import { PAGE_ANNOTATION_KINDS, type UserScope } from "@medos/database";
import { z } from "zod";

/*
 * The viewer's actions on the user's own layer over a lecture PDF, kept apart
 * from the Server Function wrappers so they can be tested directly.
 *
 * Input from the browser is untrusted: it is parsed here and checked against
 * the PDF's pages by the user-scoped data layer. Anything else the browser
 * sends (such as a user id) is discarded. None of these actions changes
 * lecture completion.
 */

const page = z.number().int().positive().max(100_000);

const createInput = z.object({
  resourceId: z.uuid(),
  kind: z.enum(PAGE_ANNOTATION_KINDS),
  page,
  note: z.string().max(10_000).nullable().optional(),
});
const noteInput = z.object({ annotationId: z.uuid(), note: z.string().max(10_000) });
const removeInput = z.object({ annotationId: z.uuid() });
const positionInput = z.object({ resourceId: z.uuid(), page });

export type ActionResult<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

export const MESSAGES = {
  notFound: "This lecture could not be found.",
  invalid: "This page could not be marked. Reload the page and try again.",
  emptyNote: "Write something in the note before saving it.",
  annotationMissing: "This item could not be found. It may already have been removed.",
} as const;

export async function createPageAnnotation(
  scope: UserScope,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.invalid };
  const { resourceId, ...annotation } = parsed.data;
  if (annotation.kind === "note" && !annotation.note?.trim()) {
    return { ok: false, error: MESSAGES.emptyNote };
  }
  const result = await scope.originalLectures.annotations.create(resourceId, annotation);
  if (result.ok) return { ok: true, value: { id: result.annotation.id } };
  return { ok: false, error: result.reason === "not-found" ? MESSAGES.notFound : MESSAGES.invalid };
}

export async function updatePageNote(scope: UserScope, input: unknown): Promise<ActionResult> {
  const parsed = noteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.invalid };
  if (!parsed.data.note.trim()) return { ok: false, error: MESSAGES.emptyNote };
  const updated = await scope.originalLectures.annotations.updateNote(
    parsed.data.annotationId,
    parsed.data.note,
  );
  return updated
    ? { ok: true, value: undefined }
    : { ok: false, error: MESSAGES.annotationMissing };
}

export async function removePageAnnotation(
  scope: UserScope,
  input: unknown,
): Promise<ActionResult> {
  const parsed = removeInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.annotationMissing };
  const removed = await scope.originalLectures.annotations.remove(parsed.data.annotationId);
  return removed
    ? { ok: true, value: undefined }
    : { ok: false, error: MESSAGES.annotationMissing };
}

/** Remembers the page the user is on. Never changes lecture completion. */
export async function recordViewerPosition(
  scope: UserScope,
  input: unknown,
): Promise<ActionResult<{ page: number }>> {
  const parsed = positionInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.notFound };
  const recorded = await scope.originalLectures.position.record(
    parsed.data.resourceId,
    parsed.data.page,
  );
  return recorded
    ? { ok: true, value: { page: recorded } }
    : { ok: false, error: MESSAGES.notFound };
}
