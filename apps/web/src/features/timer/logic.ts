import {
  STUDY_ACTIVITIES,
  STUDY_PAUSE_REASONS,
  type StudySessionView,
  type UserScope,
} from "@medos/database";
import { z } from "zod";

/*
 * The study timer's Server Functions, kept apart from their wrappers so they
 * can be tested directly. Input from the browser is untrusted: it can say
 * what to do, never what time it is. An automatic pause says how long the
 * user has been idle and the server works out when that was, so a wrong
 * browser clock cannot add or remove time. Nothing here changes lecture
 * completion.
 */

export type ActionResult<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

export type StartOutcome =
  { started: true; session: StudySessionView } | { started: false; open: StudySessionView };

export const MESSAGES = {
  invalid: "The timer could not be changed. Reload the page and try again.",
  notFound: "This lecture or course could not be found. Reload the page and try again.",
  gone: "This timer no longer exists. It may have been finished or discarded in another tab.",
  sessionMissing: "This study session could not be found. It may already be deleted.",
} as const;

/** The longest idle period a pause may be backdated by: a full day. */
const MAX_IDLE_MS = 24 * 60 * 60 * 1000;

const startInput = z.object({
  activity: z.enum(STUDY_ACTIVITIES),
  courseId: z.uuid().nullable().optional(),
  lectureId: z.uuid().nullable().optional(),
  replaceOpen: z.boolean().optional(),
});

const sessionInput = z.object({ sessionId: z.uuid() });

const pauseInput = sessionInput.extend({
  reason: z.enum(STUDY_PAUSE_REASONS),
  idleForMs: z.number().int().min(0).max(MAX_IDLE_MS).optional(),
});

export async function startTimer(
  scope: UserScope,
  input: unknown,
  now = new Date(),
): Promise<ActionResult<StartOutcome>> {
  const parsed = startInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.invalid };
  const result = await scope.studySessions.start(parsed.data, now);
  if (result.ok) return { ok: true, value: { started: true, session: result.session } };
  if (result.reason === "already-open") {
    return { ok: true, value: { started: false, open: result.open } };
  }
  return {
    ok: false,
    error: result.reason === "not-found" ? MESSAGES.notFound : MESSAGES.invalid,
  };
}

export async function pauseTimer(
  scope: UserScope,
  input: unknown,
  now = new Date(),
): Promise<ActionResult<StudySessionView>> {
  const parsed = pauseInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.invalid };
  const { sessionId, reason, idleForMs } = parsed.data;
  const at = idleForMs === undefined ? undefined : new Date(now.getTime() - idleForMs);
  return found(await scope.studySessions.pause(sessionId, { reason, at }, now));
}

export type TimerCommand = "resume" | "heartbeat" | "finish";

/** Resume, heartbeat or finish: the commands that only name the session. */
export async function commandTimer(
  scope: UserScope,
  command: TimerCommand,
  input: unknown,
  now = new Date(),
): Promise<ActionResult<StudySessionView>> {
  const parsed = sessionInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.invalid };
  const { sessionId } = parsed.data;
  const session =
    command === "resume"
      ? await scope.studySessions.resume(sessionId, now)
      : command === "heartbeat"
        ? await scope.studySessions.heartbeat(sessionId, now)
        : await scope.studySessions.finish(sessionId, now);
  return found(session);
}

/** Discards an open timer or deletes a finished session. */
export async function deleteSession(scope: UserScope, input: unknown): Promise<ActionResult> {
  const parsed = sessionInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.invalid };
  return (await scope.studySessions.delete(parsed.data.sessionId))
    ? { ok: true, value: undefined }
    : { ok: false, error: MESSAGES.sessionMissing };
}

function found(session: StudySessionView | null): ActionResult<StudySessionView> {
  return session ? { ok: true, value: session } : { ok: false, error: MESSAGES.gone };
}
