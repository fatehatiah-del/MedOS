"use client";

import { useEffect, useRef } from "react";

import { recordStudyGuideProgress } from "./actions";
import { useReader } from "./reader-context";

/**
 * Records how far through the guide the user has read: when the end of a
 * section scrolls into view, that section has been reached. Saved in small
 * batches, and when the page is hidden. Reading progress is never lecture
 * completion; nothing here can mark a lecture complete.
 */
export function ProgressTracker() {
  const { resourceId, setProgress } = useReader();
  const pending = useRef<string | null>(null);
  const saving = useRef(false);

  useEffect(() => {
    const flush = async () => {
      const sectionId = pending.current;
      if (!sectionId || saving.current) return;
      pending.current = null;
      saving.current = true;
      try {
        const result = await recordStudyGuideProgress({ resourceId, sectionId });
        if (result.ok) setProgress(result.value);
      } catch {
        // Progress is best effort: a failed save is retried with the next section reached.
      } finally {
        saving.current = false;
      }
    };

    const ends = [...document.querySelectorAll<HTMLElement>("[data-sg-end]")];
    const observer = new IntersectionObserver(
      (entries) => {
        // Several short sections can end on one screen: the furthest counts.
        let furthest = -1;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            furthest = Math.max(furthest, ends.indexOf(entry.target as HTMLElement));
          }
        }
        const reached = ends[furthest]?.getAttribute("data-sg-end");
        if (reached) pending.current = reached;
      },
      // Visible at all counts: the last section's end may never rise far up the screen.
      { rootMargin: "0px" },
    );
    ends.forEach((end) => observer.observe(end));

    const interval = window.setInterval(() => void flush(), 2000);
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      observer.disconnect();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onHide);
      void flush();
    };
  }, [resourceId, setProgress]);

  return null;
}
