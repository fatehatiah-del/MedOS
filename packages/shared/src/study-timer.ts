/**
 * Timing policy of the study timer, shared by the server (which keeps the
 * time) and the browser (which reports activity and pauses when idle).
 */
export const STUDY_TIMER = {
  /** How often an open, active page reports that the user is still studying. */
  heartbeatSeconds: 60,
  /** Without input for this long, the browser pauses the timer. */
  idlePauseSeconds: 5 * 60,
  /** With the tab hidden for this long, the browser pauses the timer. */
  hiddenPauseSeconds: 2 * 60,
  /**
   * Without a heartbeat for this long, a running timer is treated as
   * interrupted. Longer than the idle pause plus one heartbeat, so a page that
   * is merely idle pauses itself before it would ever look interrupted.
   */
  staleSeconds: 7 * 60,
} as const;

/** A duration in seconds as a clock: "4:05", "1:02:09". */
export function formatClock(totalSeconds: number): string {
  const whole = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
