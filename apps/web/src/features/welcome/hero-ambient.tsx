"use client";

import { useEffect, useRef } from "react";

import styles from "./welcome-motion.module.css";

/**
 * The hero's living background: brand-blue and violet light that fades in on arrival and keeps
 * drifting, a faint grid, and an ECG trace that sweeps across. Decorative only. It runs while
 * the hero is on screen and pauses when it is not, so it never costs anything further down.
 */
export function HeroAmbient() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) el.dataset.running = String(entry.isIntersecting);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={root} aria-hidden="true" className={styles.heroAmbient} data-running="true">
      <span className={styles.auroraA} />
      <span className={styles.auroraB} />
      <span className={styles.auroraC} />
      <svg
        className={styles.heroTrace}
        viewBox="0 0 1200 120"
        preserveAspectRatio="none"
        fill="none"
      >
        <defs>
          <linearGradient id="hero-trace-fade" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#7aa7ff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#8fb4ff" />
            <stop offset="1" stopColor="#ff6f98" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          className={styles.heroTraceBase}
          d="M0 70h300l18-14 20 34 26-78 22 58 16-10h300l18-14 20 34 26-78 22 58 16-10h396"
          pathLength={1}
          vectorEffect="non-scaling-stroke"
        />
        <path
          className={styles.heroTracePulse}
          d="M0 70h300l18-14 20 34 26-78 22 58 16-10h300l18-14 20 34 26-78 22 58 16-10h396"
          pathLength={1}
          stroke="url(#hero-trace-fade)"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
