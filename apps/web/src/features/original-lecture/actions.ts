"use server";

import { refresh } from "next/cache";

import { getWorkspace } from "@/server/workspace";

import {
  type ActionResult,
  createPageAnnotation,
  recordViewerPosition,
  removePageAnnotation,
  updatePageNote,
} from "./annotations";

/*
 * Server Functions behind the lecture viewer. Each verifies the session itself
 * and acts only through the signed-in user's scope. A change to annotations
 * re-renders the page in the same round trip. Nothing here touches lecture
 * completion.
 */

export async function addPageAnnotation(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { scope } = await getWorkspace();
  const result = await createPageAnnotation(scope, input);
  if (result.ok) refresh();
  return result;
}

export async function editPageNote(input: unknown): Promise<ActionResult> {
  const { scope } = await getWorkspace();
  const result = await updatePageNote(scope, input);
  if (result.ok) refresh();
  return result;
}

export async function deletePageAnnotation(input: unknown): Promise<ActionResult> {
  const { scope } = await getWorkspace();
  const result = await removePageAnnotation(scope, input);
  if (result.ok) refresh();
  return result;
}

export async function saveViewerPosition(input: unknown): Promise<ActionResult<{ page: number }>> {
  const { scope } = await getWorkspace();
  return recordViewerPosition(scope, input);
}
