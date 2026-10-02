import type { Block } from "./blocks";
import { type Inline, plainText } from "./inline";
import type { StudyGuideDocument } from "./study-guide";

/*
 * Addressing text inside parsed content.
 *
 * A text unit is one run of readable source text: a paragraph, a list item, a
 * flow step, a figure caption or a section heading. Every unit has a path that
 * says where it sits in its section, so user data (highlights, notes) can point
 * at a passage without copying or changing the source:
 *
 *   h                 the section's heading
 *   3                 the section's fourth block (a paragraph)
 *   3.i2              the third item of the list that is block 3
 *   3.s1              the second step of the flow that is block 3
 *   3.cap             the caption of the figure that is block 3
 *   3.b0              the first block inside the callout that is block 3
 *   3.r1.c2.b0        the first block of row 1, cell 2 of the table that is block 3
 *   3.n.b0            the first note beside the figure that is block 3
 *
 * The renderer and the server both build paths with these functions, so a
 * path recorded in the browser always means the same text on the server.
 */

/** The path of a section's heading. */
export const HEADING_UNIT = "h";

/** Path of block `index` inside `parent` (a container's path), or at the top of a section. */
export function blockPath(parent: string | null, index: number): string {
  return parent === null ? `${index}` : `${parent}.b${index}`;
}

export const listItemPath = (list: string, index: number) => `${list}.i${index}`;
export const flowStepPath = (flow: string, index: number) => `${flow}.s${index}`;
export const captionPath = (figure: string) => `${figure}.cap`;
/** The container path of a figure's notes; notes are `blockPath(figureNotesPath(f), k)`. */
export const figureNotesPath = (figure: string) => `${figure}.n`;
/** The container path of a table cell; its blocks are `blockPath(cellPath(t, r, c), k)`. */
export const cellPath = (table: string, row: number, cell: number) => `${table}.r${row}.c${cell}`;

const UNIT_PATH = /^(h|\d+(\.(i\d+|s\d+|cap|b\d+|r\d+\.c\d+|n))*)$/;

/** Whether a string has the shape of a unit path. Says nothing about whether it exists. */
export function isUnitPath(value: string): boolean {
  return value.length <= 200 && UNIT_PATH.test(value);
}

/** Every text unit of some blocks, in reading order, keyed by path. */
export function collectTextUnits(
  blocks: readonly Block[],
  parent: string | null = null,
  into = new Map<string, Inline[]>(),
): Map<string, Inline[]> {
  blocks.forEach((block, index) => {
    const path = blockPath(parent, index);
    switch (block.type) {
      case "paragraph":
        into.set(path, block.inlines);
        break;
      case "list":
        block.items.forEach((item, itemIndex) =>
          into.set(listItemPath(path, itemIndex), item.inlines),
        );
        break;
      case "flow":
        block.steps.forEach((step, stepIndex) => into.set(flowStepPath(path, stepIndex), step));
        break;
      case "callout":
        collectTextUnits(block.blocks, path, into);
        break;
      case "table":
        block.rows.forEach((row, rowIndex) =>
          row.cells.forEach((cell, cellIndex) =>
            collectTextUnits(cell.blocks, cellPath(path, rowIndex, cellIndex), into),
          ),
        );
        break;
      case "figure":
        into.set(captionPath(path), block.caption);
        collectTextUnits(block.notes, figureNotesPath(path), into);
        break;
      case "image":
      case "missing-image":
        break;
    }
  });
  return into;
}

/**
 * The text units of one part of a study guide: a section (by id, including its
 * heading) or, for `null`, the preamble before the first heading. Null when
 * the section does not exist.
 */
export function studyGuideTextUnits(
  document: StudyGuideDocument,
  sectionId: string | null,
): Map<string, Inline[]> | null {
  if (sectionId === null) return collectTextUnits(document.preamble);
  const section = document.sections.find((candidate) => candidate.id === sectionId);
  if (!section) return null;
  const units = new Map<string, Inline[]>([[HEADING_UNIT, section.heading]]);
  return collectTextUnits(section.blocks, null, units);
}

/**
 * The text of a unit as offsets count it: text and slide references as
 * written, and one character ("\n") for each line break.
 */
export const unitText = (inlines: readonly Inline[]): string => plainText(inlines);

/*
 * Anchors: how user data points at source text.
 *
 * An anchor records the section, the unit path and the character offsets of
 * a passage, plus the passage itself (`quote`) and a little text either side.
 * The offsets are exact for the content the anchor was made against. If the
 * source is imported again and the text moves, the quote and its context find
 * it again; if it is gone, the anchor is reported as orphaned rather than
 * attached to the wrong words.
 */

/** Characters of context kept either side of a quote. */
export const ANCHOR_CONTEXT_LENGTH = 32;

export interface TextAnchor {
  /** Null for the preamble before the first heading. */
  sectionId: string | null;
  /** Null for an anchor on a whole section. */
  unitPath: string | null;
  start: number | null;
  end: number | null;
  quote: string;
  prefix: string;
  suffix: string;
}

export type ResolvedAnchor =
  | { status: "text"; sectionId: string | null; unitPath: string; start: number; end: number }
  | { status: "section"; sectionId: string | null }
  | { status: "orphaned" };

/** The context either side of `text.slice(start, end)`. */
export function anchorContext(
  text: string,
  start: number,
  end: number,
): { prefix: string; suffix: string } {
  return {
    prefix: text.slice(Math.max(0, start - ANCHOR_CONTEXT_LENGTH), start),
    suffix: text.slice(end, end + ANCHOR_CONTEXT_LENGTH),
  };
}

function commonSuffixLength(a: string, b: string): number {
  let length = 0;
  while (
    length < a.length &&
    length < b.length &&
    a[a.length - 1 - length] === b[b.length - 1 - length]
  ) {
    length += 1;
  }
  return length;
}

function commonPrefixLength(a: string, b: string): number {
  let length = 0;
  while (length < a.length && length < b.length && a[length] === b[length]) length += 1;
  return length;
}

interface Candidate {
  sectionId: string | null;
  unitPath: string;
  start: number;
  score: number;
}

/** Every place `quote` occurs in some units, scored by how well its context matches. */
function findQuote(
  units: Map<string, Inline[]>,
  sectionId: string | null,
  anchor: TextAnchor,
): Candidate[] {
  const found: Candidate[] = [];
  for (const [unitPath, inlines] of units) {
    const text = unitText(inlines);
    for (let at = text.indexOf(anchor.quote); at !== -1; at = text.indexOf(anchor.quote, at + 1)) {
      const context = anchorContext(text, at, at + anchor.quote.length);
      const score =
        commonSuffixLength(context.prefix, anchor.prefix) +
        commonPrefixLength(context.suffix, anchor.suffix);
      found.push({ sectionId, unitPath, start: at, score });
    }
  }
  return found;
}

function best(candidates: Candidate[], quote: string): ResolvedAnchor | null {
  let chosen: Candidate | undefined;
  for (const candidate of candidates) {
    if (!chosen || candidate.score > chosen.score) chosen = candidate;
  }
  return chosen
    ? {
        status: "text",
        sectionId: chosen.sectionId,
        unitPath: chosen.unitPath,
        start: chosen.start,
        end: chosen.start + quote.length,
      }
    : null;
}

/**
 * Where an anchor points in this version of a study guide.
 *
 * In order: the recorded unit and offsets, if they still hold exactly the
 * quote; the quote elsewhere in the same section, then anywhere in the guide
 * (preferring the closest match of context); otherwise orphaned. A section anchor resolves while its section exists, or a section
 * whose heading is its quote.
 */
export function resolveAnchor(document: StudyGuideDocument, anchor: TextAnchor): ResolvedAnchor {
  const sectionUnits = studyGuideTextUnits(document, anchor.sectionId);

  if (anchor.unitPath === null) {
    if (sectionUnits) return { status: "section", sectionId: anchor.sectionId };
    const renamed = document.sections.find((section) => unitText(section.heading) === anchor.quote);
    return renamed ? { status: "section", sectionId: renamed.id } : { status: "orphaned" };
  }

  if (anchor.quote.length === 0) return { status: "orphaned" };

  if (sectionUnits && anchor.start !== null && anchor.end !== null) {
    const unit = sectionUnits.get(anchor.unitPath);
    if (unit && unitText(unit).slice(anchor.start, anchor.end) === anchor.quote) {
      return {
        status: "text",
        sectionId: anchor.sectionId,
        unitPath: anchor.unitPath,
        start: anchor.start,
        end: anchor.end,
      };
    }
  }

  if (sectionUnits) {
    // Context decides; staying in the recorded unit only breaks ties.
    const inSection = findQuote(sectionUnits, anchor.sectionId, anchor).map((candidate) => ({
      ...candidate,
      score: candidate.score * 2 + (candidate.unitPath === anchor.unitPath ? 1 : 0),
    }));
    const found = best(inSection, anchor.quote);
    if (found) return found;
  }

  const everywhere: Candidate[] = [
    ...findQuote(collectTextUnits(document.preamble), null, anchor),
    ...document.sections.flatMap((section) =>
      findQuote(studyGuideTextUnits(document, section.id) ?? new Map(), section.id, anchor),
    ),
  ];
  return best(everywhere, anchor.quote) ?? { status: "orphaned" };
}
