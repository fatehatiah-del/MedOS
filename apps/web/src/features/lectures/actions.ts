"use server";

import { revalidatePath } from "next/cache";

import { getWorkspace } from "@/server/workspace";

import { type CompletionResult, applyLectureCompletion } from "./completion";

/**
 * Server Function behind "Mark lecture complete" and "Mark as incomplete".
 * It verifies the session itself (a Server Function is reachable by a direct
 * POST, so the page's own check does not cover it), then refreshes every
 * course page so progress shows the change.
 */
export async function setLectureCompletion(input: {
  lectureId: string;
  completed: boolean;
}): Promise<CompletionResult> {
  const { scope } = await getWorkspace();
  const result = await applyLectureCompletion(scope, input);
  if (result.ok) revalidatePath("/courses", "layout");
  return result;
}
