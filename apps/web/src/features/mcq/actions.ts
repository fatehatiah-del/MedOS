"use server";

import { refresh } from "next/cache";

import { getWorkspace } from "@/server/workspace";

import {
  type ActionResult,
  answerLearnQuestion,
  discardSession,
  finishSession,
  saveExamAnswer,
  startSession,
} from "./logic";
import type { Feedback } from "./views";

/*
 * Server Functions behind MCQ practice. Each verifies the session itself and
 * acts only through the signed-in user's scope. Nothing here touches lecture
 * completion.
 */

export async function startMcqSession(
  input: unknown,
): Promise<ActionResult<{ sessionId: string }>> {
  const { scope } = await getWorkspace();
  return startSession(scope, input);
}

export async function answerMcqQuestion(
  input: unknown,
): Promise<ActionResult<{ selected: number; feedback: Feedback }>> {
  const { scope } = await getWorkspace();
  return answerLearnQuestion(scope, input);
}

export async function saveMcqAnswer(input: unknown): Promise<ActionResult<{ expired: boolean }>> {
  const { scope } = await getWorkspace();
  return saveExamAnswer(scope, input);
}

export async function finishMcqSession(input: unknown): Promise<ActionResult> {
  const { scope } = await getWorkspace();
  const result = await finishSession(scope, input);
  if (result.ok) refresh();
  return result;
}

export async function discardMcqSession(input: unknown): Promise<ActionResult> {
  const { scope } = await getWorkspace();
  const result = await discardSession(scope, input);
  if (result.ok) refresh();
  return result;
}
