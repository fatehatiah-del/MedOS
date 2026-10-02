"use server";

import { refresh } from "next/cache";

import { getWorkspace } from "@/server/workspace";

import {
  type ActionResult,
  type ProgressSnapshot,
  createAnnotation,
  recordReadingProgress,
  removeAnnotation,
  updateAnnotationNote,
} from "./annotations";

/*
 * Server Functions behind the Study Guide reader. Each verifies the session
 * itself (a Server Function is reachable by a direct POST, so the page's own
 * check does not cover it) and acts only through the signed-in user's scope.
 * A change to annotations re-renders the reader in the same round trip, so
 * the marks appear in the text. Nothing here touches lecture completion.
 */

export async function addStudyGuideAnnotation(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const { scope } = await getWorkspace();
  const result = await createAnnotation(scope, input);
  if (result.ok) refresh();
  return result;
}

export async function editStudyGuideNote(input: unknown): Promise<ActionResult> {
  const { scope } = await getWorkspace();
  const result = await updateAnnotationNote(scope, input);
  if (result.ok) refresh();
  return result;
}

export async function removeStudyGuideAnnotation(input: unknown): Promise<ActionResult> {
  const { scope } = await getWorkspace();
  const result = await removeAnnotation(scope, input);
  if (result.ok) refresh();
  return result;
}

export async function recordStudyGuideProgress(
  input: unknown,
): Promise<ActionResult<ProgressSnapshot>> {
  const { scope } = await getWorkspace();
  return recordReadingProgress(scope, input);
}
