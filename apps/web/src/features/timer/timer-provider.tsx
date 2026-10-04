"use client";

import type { StudyActivity, StudySessionView } from "@medos/database";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  currentTimer,
  deleteStudySession,
  finishStudyTimer,
  heartbeatStudyTimer,
  pauseStudyTimer,
  resumeStudyTimer,
  startStudyTimer,
} from "./actions";
import { PAUSE_LABELS, displaySeconds, heartbeatDue, pauseDecision, spokenDuration } from "./clock";
import type { ActionResult } from "./logic";

/*
 * The study timer in the browser. The server keeps the time; this keeps the
 * open session on screen, tells the server the user is still studying, and
 * pauses the timer when the user goes idle or leaves the tab in the
 * background, backdated so that time is not counted. It lives in the app
 * layout, so moving between pages never interrupts it; a reload picks the
 * open session up from the server again.
 */

export interface StartRequest {
  activity: StudyActivity;
  courseId?: string | null;
  lectureId?: string | null;
  replaceOpen?: boolean;
}

export type StartResponse =
  { status: "started" } | { status: "conflict"; open: StudySessionView } | { status: "error" };

interface TimerContextValue {
  session: StudySessionView | null;
  /** When `session` arrived, on the browser's clock; elapsed time is counted from it. */
  receivedAt: number;
  pending: boolean;
  error: string | null;
  /** A short sentence for screen readers about the latest change. */
  announcement: string;
  start(request: StartRequest): Promise<StartResponse>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  finish(): Promise<void>;
  discard(): Promise<void>;
}

const TimerContext = createContext<TimerContextValue | null>(null);

export function useStudyTimer(): TimerContextValue {
  const value = useContext(TimerContext);
  if (!value) throw new Error("useStudyTimer must be used inside StudyTimerProvider.");
  return value;
}

/** The displayed active seconds, ticking once a second while the timer runs. */
export function useTimerSeconds(): number {
  const { session, receivedAt } = useStudyTimer();
  const [now, setNow] = useState(() => Date.now());
  const running = session?.state === "running";
  useEffect(() => {
    // Until the first tick, a "now" older than `receivedAt` shows the server figure as is.
    if (!running) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [running, receivedAt]);
  return session ? displaySeconds(session, receivedAt, now) : 0;
}

const INPUT_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;
/** How often a running timer checks for idleness and heartbeats. */
const CHECK_MS = 15_000;

export function StudyTimerProvider({
  initial,
  children,
}: {
  initial: StudySessionView | null;
  children: ReactNode;
}) {
  const [state, setState] = useState(() => ({ session: initial, receivedAt: Date.now() }));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const session = state.session;
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const show = useCallback((next: StudySessionView | null) => {
    // A finished session is no longer the open one.
    setState({ session: next?.state === "finished" ? null : next, receivedAt: Date.now() });
  }, []);

  /** Runs an action, shows its session, and says what went wrong if it failed. */
  const run = useCallback(
    async (
      action: () => Promise<ActionResult<StudySessionView>>,
      announce: (session: StudySessionView) => string,
    ) => {
      setPending(true);
      setError(null);
      try {
        const result = await action();
        if (result.ok) {
          show(result.value);
          setAnnouncement(announce(result.value));
        } else {
          setError(result.error);
          show(await currentTimer());
        }
      } catch {
        setError("The timer could not reach MedOS. Check your connection and try again.");
      } finally {
        setPending(false);
      }
    },
    [show],
  );

  const pauseWith = useCallback(
    (reason: "manual" | "idle" | "hidden", idleForMs?: number) => {
      const open = sessionRef.current;
      if (!open || open.state !== "running") return Promise.resolve();
      return run(
        () => pauseStudyTimer({ sessionId: open.id, reason, idleForMs }),
        (paused) => `${PAUSE_LABELS[reason]}. ${spokenDuration(paused.activeSeconds)} counted.`,
      );
    },
    [run],
  );

  const value = useMemo<TimerContextValue>(() => {
    const openId = session?.id;
    const withOpen = (action: (id: string) => Promise<void>) => async () => {
      if (openId) await action(openId);
    };
    return {
      session,
      receivedAt: state.receivedAt,
      pending,
      error,
      announcement,
      async start(request) {
        setPending(true);
        setError(null);
        try {
          const result = await startStudyTimer(request);
          if (!result.ok) {
            setError(result.error);
            return { status: "error" };
          }
          if (!result.value.started) {
            show(result.value.open);
            return { status: "conflict", open: result.value.open };
          }
          show(result.value.session);
          setAnnouncement("Timer started.");
          return { status: "started" };
        } catch {
          setError("The timer could not reach MedOS. Check your connection and try again.");
          return { status: "error" };
        } finally {
          setPending(false);
        }
      },
      pause: () => pauseWith("manual"),
      resume: withOpen((sessionId) =>
        run(
          () => resumeStudyTimer({ sessionId }),
          () => "Timer resumed.",
        ),
      ),
      finish: withOpen((sessionId) =>
        run(
          () => finishStudyTimer({ sessionId }),
          (done) => `Timer finished. ${spokenDuration(done.activeSeconds)} saved.`,
        ),
      ),
      discard: withOpen(async (sessionId) => {
        setPending(true);
        setError(null);
        try {
          const result = await deleteStudySession({ sessionId });
          if (result.ok) {
            show(null);
            setAnnouncement("Timer discarded. No time was saved.");
          } else {
            setError(result.error);
            show(await currentTimer());
          }
        } catch {
          setError("The timer could not reach MedOS. Check your connection and try again.");
        } finally {
          setPending(false);
        }
      }),
    };
  }, [session, state.receivedAt, pending, error, announcement, pauseWith, run, show]);

  const running = session?.state === "running";
  const sessionId = session?.id;

  // While running: watch for activity, heartbeat, and pause when idle or hidden.
  useEffect(() => {
    if (!running || !sessionId) return;
    let lastInputAt = Date.now();
    let lastBeatAt = Date.now();
    let hiddenSince: number | null = document.hidden ? Date.now() : null;
    let stopped = false;

    const onInput = () => {
      lastInputAt = Date.now();
    };
    const check = () => {
      if (stopped) return;
      const signals = { now: Date.now(), lastInputAt, hiddenSince };
      const decision = pauseDecision(signals);
      if (decision) {
        stopped = true;
        void pauseWith(decision.reason, decision.idleForMs);
        return;
      }
      if (heartbeatDue(signals, lastBeatAt)) {
        lastBeatAt = signals.now;
        void heartbeatStudyTimer({ sessionId })
          .then((result) => {
            // Interrupted, finished or discarded elsewhere: show where it stands.
            if (result.ok && result.value.state !== "running") show(result.value);
            if (!result.ok) void currentTimer().then(show);
          })
          .catch(() => {
            // Offline for a moment: the next heartbeat tries again.
          });
      }
    };
    const onVisibility = () => {
      if (document.hidden) {
        hiddenSince = Date.now();
        return;
      }
      // Back in view: a long absence pauses (backdated) before anything else.
      check();
      hiddenSince = null;
      lastInputAt = Date.now();
    };

    for (const event of INPUT_EVENTS) window.addEventListener(event, onInput, { passive: true });
    window.addEventListener("scroll", onInput, { capture: true, passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(check, CHECK_MS);
    return () => {
      stopped = true;
      for (const event of INPUT_EVENTS) window.removeEventListener(event, onInput);
      window.removeEventListener("scroll", onInput, { capture: true });
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, [running, sessionId, pauseWith, show]);

  // Closing or reloading the tab while timing asks first. The session is kept
  // on the server either way; this only guards against leaving by accident.
  useEffect(() => {
    if (!running) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [running]);

  // Coming back to the tab, catch up with changes made in another tab.
  useEffect(() => {
    const onVisible = () => {
      if (document.hidden) return;
      void currentTimer()
        .then((latest) => {
          const shown = sessionRef.current;
          if (latest?.id !== shown?.id || latest?.state !== shown?.state) show(latest);
        })
        .catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [show]);

  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>;
}
