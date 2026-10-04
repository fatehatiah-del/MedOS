import { MCQ_MODES, type UserScope } from "@medos/database";
import { z } from "zod";

import { DEFAULT_SECONDS_PER_QUESTION, selectQuestions } from "./selection";
import { type Feedback, feedbackFor } from "./views";

/*
 * MCQ practice actions, kept apart from the Server Function wrappers so they
 * can be tested directly. Input from the browser is untrusted; whose data it
 * is comes only from the scope. The server marks every answer: the browser
 * only ever receives feedback after answering (Learn) or submitting (Exam,
 * USMLE). Nothing here changes lecture completion.
 */

export type ActionResult<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

export const MESSAGES = {
  notFound: "This quiz could not be found.",
  sessionNotFound: "This practice session could not be found.",
  noQuestions: "No questions match this choice. Choose another topic or mode.",
  invalid: "This could not be saved. Reload the page and try again.",
  closed: "This session has already ended.",
  expired: "Time is up. Your exam is being submitted.",
} as const;

const startInput = z.object({
  resourceId: z.uuid(),
  mode: z.enum(MCQ_MODES),
  topic: z.string().max(300).nullable(),
  count: z.number().int().min(1).max(1000).nullable(),
  shuffle: z.boolean(),
  timing: z.enum(["default", "untimed", "custom"]),
  minutes: z.number().int().min(1).max(600).nullable(),
});

const answerInput = z.object({
  sessionId: z.uuid(),
  key: z.string().max(20),
  optionIndex: z.number().int().min(0).max(25),
  timeMs: z.number().min(0).max(86_400_000),
});

const draftInput = z.object({
  sessionId: z.uuid(),
  key: z.string().max(20),
  optionIndex: z.number().int().min(0).max(25).nullable(),
  flagged: z.boolean(),
  timeMs: z.number().min(0).max(86_400_000),
});

const sessionInput = z.object({ sessionId: z.uuid() });

/** The time limit of a new session, in seconds, or null for untimed. */
export function timeLimitFor(
  mode: (typeof MCQ_MODES)[number],
  questionCount: number,
  timing: "default" | "untimed" | "custom",
  minutes: number | null,
): number | null {
  if (mode === "learn" || timing === "untimed") return null;
  if (timing === "custom") return minutes ? minutes * 60 : null;
  return questionCount * DEFAULT_SECONDS_PER_QUESTION;
}

export async function startSession(
  scope: UserScope,
  input: unknown,
  random: () => number = Math.random,
): Promise<ActionResult<{ sessionId: string }>> {
  const parsed = startInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.invalid };
  const { resourceId, mode, topic, count, shuffle, timing, minutes } = parsed.data;
  if (timing === "custom" && minutes === null) return { ok: false, error: MESSAGES.invalid };

  const quiz = await scope.mcq.get(resourceId);
  if (!quiz) return { ok: false, error: MESSAGES.notFound };
  const keys = selectQuestions(quiz.set, { mode, topic, count, shuffle, random });
  if (keys.length === 0) return { ok: false, error: MESSAGES.noQuestions };

  const session = await scope.mcq.sessions.start(resourceId, {
    mode,
    keys,
    shuffled: shuffle && mode !== "learn",
    timeLimitSeconds: timeLimitFor(mode, keys.length, timing, minutes),
  });
  return session
    ? { ok: true, value: { sessionId: session.id } }
    : { ok: false, error: MESSAGES.invalid };
}

/** Learn mode: marks an answer and returns its feedback. */
export async function answerLearnQuestion(
  scope: UserScope,
  input: unknown,
): Promise<ActionResult<{ selected: number; feedback: Feedback }>> {
  const parsed = answerInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.invalid };
  const { sessionId, ...answer } = parsed.data;
  const result = await scope.mcq.sessions.answer(sessionId, answer);
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === "not-found"
          ? MESSAGES.sessionNotFound
          : result.reason === "closed"
            ? MESSAGES.closed
            : MESSAGES.invalid,
    };
  }
  const selected = result.attempt.selectedOption ?? answer.optionIndex;
  return { ok: true, value: { selected, feedback: feedbackFor(result.question, selected) } };
}

/** Exam and USMLE modes: saves an answer, flag and time without marking. */
export async function saveExamAnswer(
  scope: UserScope,
  input: unknown,
): Promise<ActionResult<{ expired: boolean }>> {
  const parsed = draftInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.invalid };
  const { sessionId, ...draft } = parsed.data;
  const result = await scope.mcq.sessions.saveDraft(sessionId, draft);
  if (result.ok) return { ok: true, value: { expired: false } };
  if (result.reason === "expired") return { ok: true, value: { expired: true } };
  return {
    ok: false,
    error:
      result.reason === "not-found"
        ? MESSAGES.sessionNotFound
        : result.reason === "closed"
          ? MESSAGES.closed
          : MESSAGES.invalid,
  };
}

/** Ends a session: an exam is marked and becomes results; a Learn session is closed. */
export async function finishSession(scope: UserScope, input: unknown): Promise<ActionResult> {
  const parsed = sessionInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.sessionNotFound };
  const view = await scope.mcq.sessions.submit(parsed.data.sessionId);
  return view ? { ok: true, value: undefined } : { ok: false, error: MESSAGES.sessionNotFound };
}

/** Abandons an unfinished exam; it never counts in results. */
export async function discardSession(scope: UserScope, input: unknown): Promise<ActionResult> {
  const parsed = sessionInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.sessionNotFound };
  return (await scope.mcq.sessions.discard(parsed.data.sessionId))
    ? { ok: true, value: undefined }
    : { ok: false, error: MESSAGES.closed };
}
