"use client";

import { useEffect, useRef } from "react";

import { useReader } from "./reader-context";
import { revealAnnotation } from "./reveal";

/**
 * Opening the reader at `?annotation=<id>` (from the Review page) brings that
 * annotation's passage into view and flashes it, once. An annotation whose
 * text is gone opens the guide at the top.
 */
export function AnnotationLink() {
  const { annotations } = useReader();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const url = new URL(window.location.href);
    const id = url.searchParams.get("annotation");
    if (!id) return;
    const annotation = annotations.find((candidate) => candidate.id === id);
    if (annotation && annotation.status !== "orphaned") {
      window.requestAnimationFrame(() => revealAnnotation(annotation));
    }
    // The address keeps the guide, not the jump, so reloading does not jump again.
    url.searchParams.delete("annotation");
    window.history.replaceState(window.history.state, "", url);
  }, [annotations]);

  return null;
}
