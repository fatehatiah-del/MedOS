import { MAX_TYPED_ANSWER_LENGTH, RECALL_RATINGS, type UserScope } from "@medos/database";
import { z } from "zod";

import { type RevealedAnswer, revealedAnswer } from "./recall";

/*
 * Question Bank actions, kept apart from the Server Function wrappers so they
 * can be tested directly. Input from the browser is untrusted; whose data it
 * is comes only from the scope. The model answer is only returned once the
 * attempt is recorded. Typed answers are the user's own and are never graded
 * automatically. Nothing here changes lecture completion.
 */

export type ActionResult<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

export const MESSAGES = {
  notFound: "This question bank could not be found.",
  invalid: "This could not be saved. Reload the page and try again.",
  tooLong: "Your answer is too long to save. Shorten it and reveal again.",
  attemptMissing: "This answer could not be found. Reveal the question again.",
} as const;

const revealInput = z.object({
  resourceId: z.uuid(),
  key: z.string().max(20),
  typedAnswer: z.string().nullable(),
  timeMs: z.number().min(0).max(86_400_000),
});

const rateInput = z.object({ attemptId: z.uuid(), rating: z.enum(RECALL_RATINGS) });

export async function revealItem(
  scope: UserScope,
  input: unknown,
): Promise<ActionResult<{ attemptId: string; answer: RevealedAnswer }>> {
  const parsed = revealInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.invalid };
  const { resourceId, ...reveal } = parsed.data;
  if ((reveal.typedAnswer?.trim().length ?? 0) > MAX_TYPED_ANSWER_LENGTH) {
    return { ok: false, error: MESSAGES.tooLong };
  }
  const result = await scope.questionBanks.reveal(resourceId, reveal);
  if (!result.ok) {
    return {
      ok: false,
      error: result.reason === "not-found" ? MESSAGES.notFound : MESSAGES.invalid,
    };
  }
  return { ok: true, value: { attemptId: result.attempt.id, answer: revealedAnswer(result.item) } };
}

export async function rateAttempt(scope: UserScope, input: unknown): Promise<ActionResult> {
  const parsed = rateInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.invalid };
  const updated = await scope.questionBanks.rate(parsed.data.attemptId, parsed.data.rating);
  return updated ? { ok: true, value: undefined } : { ok: false, error: MESSAGES.attemptMissing };
}
