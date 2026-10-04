import type { StudyActivity, StudyPauseReason, StudySessionView } from "@medos/database";
import { STUDY_TIMER } from "@medos/shared";

/*
 * The browser's side of the study timer, as pure functions: what to show and
 * when to pause. The server keeps the time; these only decide what to tell it.
 */

export const ACTIVITY_LABELS: Record<StudyActivity, string> = {
  "study-guide": "Study Guide",
  "original-lecture": "Original lecture",
  mcq: "MCQ",
  "question-bank": "Question Bank",
  flashcards: "Flashcards",
  revision: "Revision",
  other: "Other study",
};

export const PAUSE_LABELS: Record<StudyPauseReason, string> = {
  manual: "Paused",
  idle: "Paused after 5 minutes without activity",
  hidden: "Paused while MedOS was in the background",
};

type TimerPolicy = Pick<
  typeof STUDY_TIMER,
  "heartbeatSeconds" | "idlePauseSeconds" | "hiddenPauseSeconds"
>;

export interface ActivitySignals {
  now: number;
  /** When the user last typed, clicked, scrolled or moved the pointer. */
  lastInputAt: number;
  /** When the tab was hidden; null while it is visible. */
  hiddenSince: number | null;
}

/**
 * Whether a running timer should pause itself, and how far back. Idle time
 * and background time are not study time, so the pause is backdated to when
 * they began.
 */
export function pauseDecision(
  { now, lastInputAt, hiddenSince }: ActivitySignals,
  policy: TimerPolicy = STUDY_TIMER,
): { reason: Extract<StudyPauseReason, "idle" | "hidden">; idleForMs: number } | null {
  if (hiddenSince !== null && now - hiddenSince >= policy.hiddenPauseSeconds * 1000) {
    return { reason: "hidden", idleForMs: now - Math.min(hiddenSince, lastInputAt) };
  }
  if (now - lastInputAt >= policy.idlePauseSeconds * 1000) {
    return { reason: "idle", idleForMs: now - lastInputAt };
  }
  return null;
}

/** Whether to tell the server the user is still here: visible, active, and due. */
export function heartbeatDue(
  { now, lastInputAt, hiddenSince }: ActivitySignals,
  lastBeatAt: number,
  policy: TimerPolicy = STUDY_TIMER,
): boolean {
  return (
    hiddenSince === null &&
    now - lastInputAt < policy.idlePauseSeconds * 1000 &&
    now - lastBeatAt >= policy.heartbeatSeconds * 1000
  );
}

/**
 * Active seconds to display: the server's figure, plus the time since it was
 * received while the timer runs. Measured on the browser's own clock from the
 * moment of receipt, so a skewed clock cannot shift it.
 */
export function displaySeconds(
  session: Pick<StudySessionView, "state" | "activeSeconds">,
  receivedAt: number,
  now: number,
): number {
  if (session.state !== "running") return session.activeSeconds;
  return session.activeSeconds + Math.max(0, Math.floor((now - receivedAt) / 1000));
}

/** "Study Guide · Lecture 3: Pharmacodynamics", or the course, or the activity alone. */
export function sessionLabel(
  session: Pick<StudySessionView, "activity" | "course" | "lecture">,
): string {
  const activity = ACTIVITY_LABELS[session.activity];
  if (session.lecture) return `${activity} · ${session.lecture.title}`;
  if (session.course) return `${activity} · ${session.course.shortName}`;
  return activity;
}

/** A spoken duration: "1 hour 5 minutes", "under a minute". */
export function spokenDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 1) return "under a minute";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const part = (value: number, unit: string) => `${value} ${unit}${value === 1 ? "" : "s"}`;
  if (hours === 0) return part(rest, "minute");
  return rest === 0 ? part(hours, "hour") : `${part(hours, "hour")} ${part(rest, "minute")}`;
}

/** The state in words: "Running", "Interrupted", or why it is paused. */
export function stateText(session: StudySessionView): string {
  if (session.state === "running") return "Running";
  if (session.state === "interrupted") return "Interrupted";
  return session.pausedReason ? PAUSE_LABELS[session.pausedReason] : "Paused";
}

/** The colour of the state dot. */
export function stateDot(session: StudySessionView): string {
  if (session.state === "running") return "bg-success";
  if (session.state === "interrupted") return "bg-danger";
  return "bg-warning";
}
