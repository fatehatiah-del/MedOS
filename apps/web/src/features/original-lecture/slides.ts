/*
 * Study Guide ↔ slide links, prepared but not active.
 *
 * Study Guides cite slides of the original lecture ("S17"). Linking them needs
 * to know which page of which lecture PDF a slide is. For PDFs exported from
 * slides that is often the same number, but MedOS does not assume it: until a
 * mapping is confirmed for a lecture, there is no page, and no link is shown.
 * The viewer already opens at any page by address (`?page=N`, see
 * `pageHref`), which is what a link will point to.
 */

export interface SlideMapping {
  /** Confirmed: slide N is page N of this PDF. */
  kind: "same-number";
  pageCount: number;
}

/** The page a slide is on, when a mapping has been confirmed; otherwise null. */
export function pageForSlide(slide: number, mapping: SlideMapping | null): number | null {
  if (!mapping || !Number.isInteger(slide) || slide < 1) return null;
  return slide <= mapping.pageCount ? slide : null;
}
