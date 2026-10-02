/*
 * Pure rules of the lecture viewer: page numbers, zoom, and which pages are
 * drawn. Kept apart from the component so they can be tested directly.
 */

/** A page number within 1..pageCount (the first page for anything unreadable). */
export function clampPage(page: number, pageCount: number): number {
  if (!Number.isFinite(page) || pageCount < 1) return 1;
  return Math.min(Math.max(Math.round(page), 1), pageCount);
}

/** The page asked for in an address (`?page=12`), or null. */
export function pageFromQuery(
  value: string | string[] | undefined,
  pageCount: number,
): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^\d{1,6}$/.test(raw)) return null;
  const page = Number(raw);
  return page >= 1 && page <= pageCount ? page : null;
}

/** Zoom levels, as a factor of the page's own size. "fit" fits the page to the width. */
export const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3] as const;
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 3;

export type Zoom = "fit" | number;

/** The next zoom step in a direction, from the scale currently shown. */
export function stepZoom(current: number, direction: 1 | -1): number {
  if (direction === 1) return ZOOM_STEPS.find((step) => step > current + 0.01) ?? MAX_ZOOM;
  return [...ZOOM_STEPS].reverse().find((step) => step < current - 0.01) ?? MIN_ZOOM;
}

/** The scale that fits a page of `pageWidth` (at scale 1) into `available` pixels. */
export function fitScale(available: number, pageWidth: number): number {
  if (available <= 0 || pageWidth <= 0) return 1;
  return Math.min(Math.max(available / pageWidth, MIN_ZOOM), MAX_ZOOM);
}

/**
 * Pages to draw: those in view and their neighbours. Everything else stays a
 * placeholder, so a long PDF never draws all its pages.
 */
export function pagesToDraw(visible: Iterable<number>, pageCount: number, around = 1): Set<number> {
  const draw = new Set<number>();
  for (const page of visible) {
    for (let offset = -around; offset <= around; offset += 1) {
      const candidate = page + offset;
      if (candidate >= 1 && candidate <= pageCount) draw.add(candidate);
    }
  }
  return draw;
}

/** The address of a page of an original lecture. */
export function pageHref(base: string, page: number): string {
  return page > 1 ? `${base}?page=${page}` : base;
}
