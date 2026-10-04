"use server";

import { getWorkspace } from "@/server/workspace";

import { type ActionResult, rateAttempt, revealItem } from "./logic";
import type { RevealedAnswer } from "./recall";

/*
 * Server Functions behind Question Bank recall. Each verifies the session
 * itself and acts only through the signed-in user's scope. Nothing here
 * touches lecture completion.
 */

export async function revealQuestion(
  input: unknown,
): Promise<ActionResult<{ attemptId: string; answer: RevealedAnswer }>> {
  const { scope } = await getWorkspace();
  return revealItem(scope, input);
}

export async function rateRecall(input: unknown): Promise<ActionResult> {
  const { scope } = await getWorkspace();
  return rateAttempt(scope, input);
}
