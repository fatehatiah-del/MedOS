/*
 * Bringing a place in the Study Guide into view and giving it focus, so
 * keyboard and screen-reader users land where they asked to go.
 */

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function focusWithoutScroll(element: HTMLElement) {
  if (!element.hasAttribute("tabindex")) {
    element.setAttribute("tabindex", "-1");
    element.addEventListener("blur", () => element.removeAttribute("tabindex"), { once: true });
  }
  element.focus({ preventScroll: true });
}

export function reveal(element: HTMLElement | null, { flash = false } = {}): boolean {
  if (!element) return false;
  element.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block: flash ? "center" : "start",
  });
  focusWithoutScroll(element);
  if (flash) {
    element.classList.add("sg-flash");
    window.setTimeout(() => element.classList.remove("sg-flash"), 1600);
  }
  return true;
}

/** Goes to a section heading and records it in the address, so it can be linked to. */
export function revealSection(sectionId: string): boolean {
  const heading = document.getElementById(sectionId);
  if (!heading) return false;
  window.history.replaceState(null, "", `#${encodeURIComponent(sectionId)}`);
  return reveal(heading);
}

/** Goes to an annotation's marked text, else its passage, else its section. */
export function revealAnnotation(annotation: {
  id: string;
  sectionId: string | null;
  unitPath: string | null;
}): boolean {
  const mark = document.querySelector<HTMLElement>(
    `[data-annotation-ids~="${CSS.escape(annotation.id)}"]`,
  );
  if (mark) return reveal(mark, { flash: true });
  if (annotation.unitPath !== null) {
    const unit = document.querySelector<HTMLElement>(
      `[data-sg-section="${CSS.escape(annotation.sectionId ?? "")}"] [data-unit="${CSS.escape(annotation.unitPath)}"]`,
    );
    if (unit) return reveal(unit, { flash: true });
  }
  return annotation.sectionId ? revealSection(annotation.sectionId) : false;
}
