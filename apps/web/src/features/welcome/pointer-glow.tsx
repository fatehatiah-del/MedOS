"use client";

import { useEffect } from "react";

/**
 * Lets any element marked `data-spotlight` follow the pointer: its border catches a soft light
 * where the cursor is (see `.spotlight` in welcome-motion.module.css). One delegated listener,
 * fine pointers only, writing two CSS variables per frame at most.
 */
export function PointerGlow() {
  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let frame = 0;
    let last: PointerEvent | null = null;
    const apply = () => {
      frame = 0;
      const target = (last?.target as Element | null)?.closest<HTMLElement>("[data-spotlight]");
      if (!target || !last) return;
      const box = target.getBoundingClientRect();
      target.style.setProperty("--mx", `${last.clientX - box.left}px`);
      target.style.setProperty("--my", `${last.clientY - box.top}px`);
    };
    const onMove = (event: PointerEvent) => {
      last = event;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
