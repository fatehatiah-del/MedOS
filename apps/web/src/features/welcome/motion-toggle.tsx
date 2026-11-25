"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

const KEY = "medos-welcome-motion";
const EVENT = "medos-motion-change";

/* The state lives on <html data-motion="paused">, which the CSS reads. */
const isPaused = () => document.documentElement.dataset.motion === "paused";

function setPaused(paused: boolean) {
  const root = document.documentElement;
  if (paused) root.dataset.motion = "paused";
  else delete root.dataset.motion;
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

/**
 * Pauses and resumes every endless animation on the welcome page (the beating heart, the hero
 * aurora and ECG sweep, the learning-flow signal). WCAG 2.2.2 asks for a way to stop motion that
 * runs longer than five seconds. The choice is remembered on this device.
 */
export function MotionToggle() {
  const paused = useSyncExternalStore(subscribe, isPaused, () => false);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "paused") setPaused(true);
    } catch {}
    // Leaving the welcome page never carries the pause into the app.
    return () => setPaused(false);
  }, []);

  const toggle = () => {
    const next = !paused;
    setPaused(next);
    try {
      localStorage.setItem(KEY, next ? "paused" : "running");
    } catch {}
  };

  const label = paused ? "Play animations" : "Pause animations";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={paused}
      aria-label={label}
      title={label}
      className="flex size-9 items-center justify-center rounded-lg text-fg-muted transition-colors duration-150 hover:bg-hover hover:text-fg"
    >
      {paused ? (
        <Play aria-hidden="true" className="size-4" />
      ) : (
        <Pause aria-hidden="true" className="size-4" />
      )}
    </button>
  );
}
