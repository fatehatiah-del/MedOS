"use server";

import { refresh } from "next/cache";

import { getWorkspace } from "@/server/workspace";

import { type ActionResult, markDifficult, unmarkDifficult } from "./logic";

/*
 * Server Functions behind marking concepts difficult. Each verifies the
 * session itself and acts only through the signed-in user's scope.
 */

export async function markConceptDifficult(input: unknown): Promise<ActionResult> {
  const { scope } = await getWorkspace();
  const result = await markDifficult(scope, input);
  if (result.ok) refresh();
  return result;
}

export async function unmarkConceptDifficult(input: unknown): Promise<ActionResult> {
  const { scope } = await getWorkspace();
  const result = await unmarkDifficult(scope, input);
  if (result.ok) refresh();
  return result;
}
