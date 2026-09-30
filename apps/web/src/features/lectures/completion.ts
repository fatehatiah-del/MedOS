import type { UserScope } from "@medos/database";
import { z } from "zod";

/*
 * Marking a lecture complete (or incomplete again) is always an explicit user
 * action. This is the whole of that action, kept apart from the Server
 * Function wrapper so it can be tested directly.
 */

const completionInput = z.object({
  lectureId: z.uuid(),
  completed: z.boolean(),
});

export type CompletionResult =
  { ok: true; completedAt: string | null } | { ok: false; error: string };

export const COMPLETION_NOT_FOUND = "This lecture could not be found.";
export const COMPLETION_INVALID = "This lecture could not be updated.";

/**
 * Applies a completion request from the browser to the signed-in user's scope.
 *
 * The input is untrusted: only a lecture id and a flag are read, and anything
 * else it carries (such as a user id) is discarded. Whose progress changes is
 * decided solely by the scope, which comes from the verified session.
 */
export async function applyLectureCompletion(
  scope: UserScope,
  input: unknown,
): Promise<CompletionResult> {
  const parsed = completionInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: COMPLETION_INVALID };

  const progress = await scope.lectures.setCompleted(parsed.data.lectureId, parsed.data.completed);
  if (!progress) return { ok: false, error: COMPLETION_NOT_FOUND };

  return { ok: true, completedAt: progress.completedAt?.toISOString() ?? null };
}
