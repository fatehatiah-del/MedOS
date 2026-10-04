"use server";

import { refresh } from "next/cache";

import { getWorkspace } from "@/server/workspace";

import { type ActionResult, practiseQuestion, removeHubItem, setQuestionReview } from "./logic";

/*
 * Server Functions behind Review Later on questions and the annotation hub.
 * Each verifies the session itself and acts only through the signed-in
 * user's scope. Nothing here touches lecture completion.
 */

export async function setQuestionReviewLater(
  input: unknown,
): Promise<ActionResult<{ marked: boolean }>> {
  const { scope } = await getWorkspace();
  return setQuestionReview(scope, input);
}

export async function removeReviewItem(input: unknown): Promise<ActionResult> {
  const { scope } = await getWorkspace();
  const result = await removeHubItem(scope, input);
  if (result.ok) refresh();
  return result;
}

export async function practiseReviewQuestion(
  input: unknown,
): Promise<ActionResult<{ sessionId: string }>> {
  const { scope } = await getWorkspace();
  return practiseQuestion(scope, input);
}
