/*
 * From a selection in the rendered Study Guide to an anchor in its source.
 *
 * Text units are the elements marked `data-unit`; their text, counted with
 * each <br> as one character, is exactly the unit's source text (see
 * `unitText` in the content model). Anything marked `data-anchor-ignore` is
 * not source text and is skipped.
 */

export interface SelectionAnchor {
  /** Null for the preamble. */
  sectionId: string | null;
  unitPath: string;
  start: number;
  end: number;
  quote: string;
}

export type SelectionResult =
  | { status: "anchor"; anchor: SelectionAnchor }
  /** The selection spans more than one paragraph, item or cell. */
  | { status: "multiple" }
  | { status: "none" };

/** The text of a node as offsets count it. */
export function anchorText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node instanceof Element) {
    if (node.hasAttribute("data-anchor-ignore")) return "";
    if (node.tagName === "BR") return "\n";
  }
  let text = "";
  node.childNodes.forEach((child) => {
    text += anchorText(child);
  });
  return text;
}

/** The offset of a boundary point (`node`, `offset`) within a unit's text. */
export function offsetWithin(unit: Element, node: Node, offset: number): number {
  const range = unit.ownerDocument.createRange();
  range.setStart(unit, 0);
  range.setEnd(node, offset);
  return anchorText(range.cloneContents()).length;
}

function sectionOf(unit: Element): string | null | undefined {
  const section = unit.closest("[data-sg-section]");
  if (!section) return undefined;
  const id = section.getAttribute("data-sg-section") ?? "";
  return id === "" ? null : id;
}

/** The part of `range` inside `unit`, trimmed of surrounding whitespace, or null if empty. */
function clampToUnit(range: Range, unit: Element): SelectionAnchor | null {
  const section = sectionOf(unit);
  const unitPath = unit.getAttribute("data-unit");
  if (section === undefined || !unitPath) return null;

  const text = anchorText(unit);
  let start = unit.contains(range.startContainer)
    ? offsetWithin(unit, range.startContainer, range.startOffset)
    : 0;
  let end = unit.contains(range.endContainer)
    ? offsetWithin(unit, range.endContainer, range.endOffset)
    : text.length;

  while (start < end && /\s/.test(text[start] ?? "")) start += 1;
  while (end > start && /\s/.test(text[end - 1] ?? "")) end -= 1;
  if (end <= start) return null;
  return { sectionId: section, unitPath, start, end, quote: text.slice(start, end) };
}

/**
 * The anchor for the current selection within `root`. A selection that
 * strays a little outside one unit (a triple click often does) is clamped to
 * the one unit it covers; one that covers text in several units is refused.
 */
export function anchorFromSelection(selection: Selection | null, root: Element): SelectionResult {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return { status: "none" };
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return { status: "none" };

  const anchors: SelectionAnchor[] = [];
  for (const unit of root.querySelectorAll("[data-unit]")) {
    if (!range.intersectsNode(unit)) continue;
    const anchor = clampToUnit(range, unit);
    if (anchor) anchors.push(anchor);
    if (anchors.length > 1) return { status: "multiple" };
  }
  const [anchor] = anchors;
  return anchor ? { status: "anchor", anchor } : { status: "none" };
}
