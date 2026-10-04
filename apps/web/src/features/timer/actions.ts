"use server";

import type { StudySessionView } from "@medos/database";
import { refresh } from "next/cache";

import { getWorkspace } from "@/server/workspace";

import {
  type ActionResult,
  type StartOutcome,
  commandTimer,
  deleteSession,
  pauseTimer,
  startTimer,
} from "./logic";

/*
 * Server Functions behind the study timer. Each verifies the session itself
 * and acts only through the signed-in user's scope. Finishing or deleting
 * refreshes the page, so study-time figures on it are current.
 */

export async function currentTimer(): Promise<StudySessionView | null> {
  const { scope } = await getWorkspace();
  return scope.studySessions.current();
}

export async function startStudyTimer(input: unknown): Promise<ActionResult<StartOutcome>> {
  const { scope } = await getWorkspace();
  const result = await startTimer(scope, input);
  // Starting with `replaceOpen` finished the previous session.
  if (result.ok && result.value.started) refresh();
  return result;
}

export async function pauseStudyTimer(input: unknown): Promise<ActionResult<StudySessionView>> {
  const { scope } = await getWorkspace();
  return pauseTimer(scope, input);
}

export async function resumeStudyTimer(input: unknown): Promise<ActionResult<StudySessionView>> {
  const { scope } = await getWorkspace();
  return commandTimer(scope, "resume", input);
}

export async function heartbeatStudyTimer(input: unknown): Promise<ActionResult<StudySessionView>> {
  const { scope } = await getWorkspace();
  return commandTimer(scope, "heartbeat", input);
}

export async function finishStudyTimer(input: unknown): Promise<ActionResult<StudySessionView>> {
  const { scope } = await getWorkspace();
  const result = await commandTimer(scope, "finish", input);
  if (result.ok) refresh();
  return result;
}

export async function deleteStudySession(input: unknown): Promise<ActionResult> {
  const { scope } = await getWorkspace();
  const result = await deleteSession(scope, input);
  if (result.ok) refresh();
  return result;
}
