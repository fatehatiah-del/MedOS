import type { Element } from "@xmldom/xmldom";

import { LIMITS, ParseError } from "../errors";
import { MediaCollector, toMedia } from "../media";
import type { Inline, MediaRef, ParseIssue, TextMark } from "../model";
import {
  attr,
  child,
  childElements,
  children,
  descendants,
  is,
  isOn,
  parseXml,
  plainAttr,
} from "./xml";
import { readZipParts } from "./zip";

/*
 * Reads a DOCX into a neutral intermediate form: paragraphs (with their style,
 * list numbering, inline text and images) and tables, in document order.
 * Resource-specific parsers (study guide, question bank) build on this.
 *
 * Only the document's XML and its images are read. Macros, embedded objects,
 * external links and fields are never executed, followed or fetched.
 */

export type DocxImage = { ok: true; media: MediaRef } | { ok: false; reason: string };

export interface DocxParagraph {
  type: "paragraph";
  styleName: string | null;
  /** 1–6 for a heading paragraph, from its style or outline level. */
  headingLevel: number | null;
  /** The paragraph uses the Title or Subtitle style. */
  titleRole: "title" | "subtitle" | null;
  numbering: { level: number; ordered: boolean } | null;
  inlines: Inline[];
  images: DocxImage[];
  /** Plain text of the paragraph, tabs included. */
  text: string;
  /** Every text run is bold. */
  allBold: boolean;
}

export interface DocxTableCell {
  nodes: DocxNode[];
  colSpan: number;
  merged: boolean;
}

export interface DocxTable {
  type: "table";
  rows: { header: boolean; cells: DocxTableCell[] }[];
}

export type DocxNode = DocxParagraph | DocxTable;

export interface DocxDocument {
  /** The title in the document's properties, if it has one. */
  propertiesTitle: string | null;
  body: DocxNode[];
  media: MediaCollector;
  issues: ParseIssue[];
}

interface StyleInfo {
  name: string | null;
  basedOn: string | null;
  outlineLevel: number | null;
}

interface Relationship {
  target: string;
  external: boolean;
}

interface RawRun {
  text: string;
  marks: TextMark[];
  isBreak?: boolean;
}

const MAIN_DOCUMENT_TYPE = /\/officeDocument$/;

export function readDocx(bytes: Uint8Array): DocxDocument {
  let hasMacros = false;
  const parts = readZipParts(bytes, (name) => {
    if (/vbaProject\.bin$/i.test(name)) hasMacros = true;
    return /\.(xml|rels)$/i.test(name) || /^word\/media\//i.test(name);
  });

  const issues: ParseIssue[] = [];
  if (hasMacros) {
    issues.push({
      code: "macros-ignored",
      message: "The document contains macros. They were not run or imported.",
    });
  }

  const packageRels = readRelationships(parts, "_rels/.rels");
  const mainTarget =
    [...packageRels.entries()].find(([, rel]) => MAIN_DOCUMENT_TYPE.test(rel.type))?.[1].target ??
    "word/document.xml";
  const mainPath = mainTarget.replace(/^\//, "");
  const mainBytes = parts.get(mainPath);
  if (!mainBytes) {
    throw new ParseError(
      "not-a-docx",
      "This file is not a valid Word document (.docx): it has no document body.",
    );
  }

  const mainDir = mainPath.includes("/") ? mainPath.slice(0, mainPath.lastIndexOf("/")) : "";
  const relsPath = `${mainDir ? `${mainDir}/` : ""}_rels/${mainPath.slice(mainPath.lastIndexOf("/") + 1)}.rels`;
  const relationships = new Map(
    [...readRelationships(parts, relsPath)].map(([id, rel]) => [
      id,
      { target: resolvePartPath(mainDir, rel.target), external: rel.external },
    ]),
  );

  const styles = readStyles(parts.get(`${mainDir}/styles.xml`) ?? parts.get("word/styles.xml"));
  const numbering = readNumbering(
    parts.get(`${mainDir}/numbering.xml`) ?? parts.get("word/numbering.xml"),
  );
  const propertiesTitle = readCoreTitle(parts.get("docProps/core.xml"));

  const root = parseXml(mainBytes, "the document body");
  const body = child(root, "w", "body");
  if (!body) {
    throw new ParseError(
      "not-a-docx",
      "This file is not a valid Word document (.docx): it has no document body.",
    );
  }

  const media = new MediaCollector();
  const context: ReadContext = { parts, relationships, styles, numbering, media, issues };
  return { propertiesTitle, body: readNodes(body, context, 0), media, issues };
}

interface ReadContext {
  parts: Map<string, Uint8Array>;
  relationships: Map<string, Relationship>;
  styles: Map<string, StyleInfo>;
  numbering: Map<string, Map<number, boolean>>;
  media: MediaCollector;
  issues: ParseIssue[];
}

function readNodes(container: Element, context: ReadContext, depth: number): DocxNode[] {
  const nodes: DocxNode[] = [];
  for (const element of childElements(container)) {
    if (is(element, "w", "p")) {
      nodes.push(readParagraph(element, context));
    } else if (is(element, "w", "tbl")) {
      if (depth >= LIMITS.maxTableDepth) {
        context.issues.push({
          code: "table-too-deep",
          message: "A table nested too deeply inside other tables was left out.",
        });
        continue;
      }
      nodes.push(readTable(element, context, depth + 1));
    } else if (is(element, "w", "sdt")) {
      const content = child(element, "w", "sdtContent");
      if (content) nodes.push(...readNodes(content, context, depth));
    } else if (is(element, "w", "customXml") || is(element, "w", "ins")) {
      nodes.push(...readNodes(element, context, depth));
    }
  }
  return nodes;
}

function readTable(table: Element, context: ReadContext, depth: number): DocxTable {
  const rows = children(table, "w", "tr").map((row) => {
    const header = isOn(child(child(row, "w", "trPr"), "w", "tblHeader"));
    const cells = children(row, "w", "tc").map((cell) => {
      const properties = child(cell, "w", "tcPr");
      const span = Number.parseInt(attr(child(properties, "w", "gridSpan"), "w", "val") ?? "1", 10);
      const vMerge = child(properties, "w", "vMerge");
      const merged = vMerge !== null && attr(vMerge, "w", "val") !== "restart";
      return {
        nodes: merged ? [] : readNodes(cell, context, depth),
        colSpan: Number.isFinite(span) && span > 1 ? Math.min(span, 63) : 1,
        merged,
      };
    });
    return { header, cells };
  });
  return { type: "table", rows: rows.filter((row) => row.cells.length > 0) };
}

function readParagraph(paragraph: Element, context: ReadContext): DocxParagraph {
  const properties = child(paragraph, "w", "pPr");
  const styleId = attr(child(properties, "w", "pStyle"), "w", "val");
  const style = styleId ? context.styles.get(styleId) : undefined;
  const styleName = style?.name ?? styleId;

  const raw: RawRun[] = [];
  const images: DocxImage[] = [];
  collectRuns(paragraph, context, raw, images);

  const inlines = toInlines(raw);
  const textRuns = raw.filter((run) => !run.isBreak && run.text.trim().length > 0);

  let numbering: DocxParagraph["numbering"] = null;
  const numPr = child(properties, "w", "numPr");
  const numId = attr(child(numPr, "w", "numId"), "w", "val");
  if (numId && numId !== "0") {
    const level = Number.parseInt(attr(child(numPr, "w", "ilvl"), "w", "val") ?? "0", 10) || 0;
    const ordered = context.numbering.get(numId)?.get(level) ?? false;
    numbering = { level: Math.min(Math.max(level, 0), 8), ordered };
  }

  return {
    type: "paragraph",
    styleName,
    headingLevel: headingLevel(styleId, properties, context.styles),
    titleRole: titleRole(styleId, context.styles),
    numbering,
    inlines,
    images,
    text: raw.map((run) => (run.isBreak ? "\n" : run.text)).join(""),
    allBold: textRuns.length > 0 && textRuns.every((run) => run.marks.includes("bold")),
  };
}

/** Walks a paragraph's runs, including those inside links, insertions and content controls. */
function collectRuns(container: Element, context: ReadContext, raw: RawRun[], images: DocxImage[]) {
  for (const element of childElements(container)) {
    if (is(element, "w", "r")) {
      readRun(element, context, raw, images);
    } else if (
      is(element, "w", "hyperlink") ||
      is(element, "w", "ins") ||
      is(element, "w", "moveTo") ||
      is(element, "w", "smartTag") ||
      is(element, "w", "fldSimple") ||
      is(element, "w", "customXml") ||
      is(element, "w", "dir") ||
      is(element, "w", "bdo")
    ) {
      // Link targets and field instructions are dropped: only the visible text is kept.
      collectRuns(element, context, raw, images);
    } else if (is(element, "w", "sdt")) {
      const content = child(element, "w", "sdtContent");
      if (content) collectRuns(content, context, raw, images);
    } else if (is(element, "mc", "AlternateContent")) {
      const choice = childElements(element).find((candidate) => is(candidate, "mc", "Choice"));
      const fallback = child(element, "mc", "Fallback");
      const chosen = choice ?? fallback;
      if (chosen) collectRuns(chosen, context, raw, images);
    }
    // w:del and w:moveFrom (deleted text) and everything else are skipped.
  }
}

function readRun(run: Element, context: ReadContext, raw: RawRun[], images: DocxImage[]) {
  const properties = child(run, "w", "rPr");
  const marks: TextMark[] = [];
  if (isOn(child(properties, "w", "b"))) marks.push("bold");
  if (isOn(child(properties, "w", "i"))) marks.push("italic");
  if (isOn(child(properties, "w", "u"))) marks.push("underline");
  const vertical = attr(child(properties, "w", "vertAlign"), "w", "val");
  if (vertical === "superscript") marks.push("superscript");
  if (vertical === "subscript") marks.push("subscript");

  for (const element of childElements(run)) {
    if (is(element, "w", "t")) {
      raw.push({ text: element.textContent ?? "", marks });
    } else if (is(element, "w", "tab") || is(element, "w", "ptab")) {
      raw.push({ text: "\t", marks });
    } else if (is(element, "w", "br") || is(element, "w", "cr")) {
      const type = attr(element, "w", "type");
      if (type !== "page" && type !== "column") raw.push({ text: "", marks, isBreak: true });
    } else if (is(element, "w", "noBreakHyphen")) {
      raw.push({ text: "-", marks });
    } else if (is(element, "w", "drawing") || is(element, "w", "pict")) {
      images.push(...readImages(element, context));
    } else if (is(element, "w", "object")) {
      context.issues.push({
        code: "embedded-object-ignored",
        message: "The document contains an embedded object. It was not opened or imported.",
      });
    } else if (is(element, "mc", "AlternateContent")) {
      const chosen =
        childElements(element).find((candidate) => is(candidate, "mc", "Choice")) ??
        child(element, "mc", "Fallback");
      if (chosen) readRun(chosen, context, raw, images);
    }
  }
}

function readImages(element: Element, context: ReadContext): DocxImage[] {
  const altText =
    descendants(element, "wp", "docPr")
      .map((docPr) => docPr.getAttribute("descr") || docPr.getAttribute("title") || "")
      .find((text) => text.length > 0) ?? undefined;

  const ids = [
    ...descendants(element, "a", "blip").map(
      (blip) => attr(blip, "r", "embed") ?? attr(blip, "r", "link"),
    ),
    ...descendants(element, "v", "imagedata").map((data) => attr(data, "r", "id")),
  ].filter((id): id is string => Boolean(id));

  return ids.map((id): DocxImage => {
    const relationship = context.relationships.get(id);
    if (!relationship || relationship.external) {
      return {
        ok: false,
        reason: "The image links to a file outside the document and was not fetched.",
      };
    }
    const bytes = context.parts.get(relationship.target);
    if (!bytes) return { ok: false, reason: "The image is missing from the document." };
    const outcome = toMedia(bytes, altText);
    if (!outcome.ok) return outcome;
    return { ok: true, media: context.media.add(outcome.media) };
  });
}

const SLIDE_REF_RUN = /^[\sS\d–-]*$/;
const SLIDE_REF_TAIL = /^\s+(S\d{1,3}(\s*[–-]\s*S?\d{1,3})?\s*)+[–-]?\s*$/;
const SLIDE_REF_TOKEN = /S(\d{1,3})(?:\s*[–-]\s*S?(\d{1,3}))?/g;
const MAX_SLIDE_RANGE = 60;

/**
 * Slide references at the end of a paragraph (" S17", " S52– S55"), as the
 * source appends them after the sentence. Ranges keep their text and list
 * every slide they cover.
 */
export function slideRefsOf(tail: string): Inline[] {
  const refs: Inline[] = [];
  for (const match of tail.matchAll(SLIDE_REF_TOKEN)) {
    const from = Number.parseInt(match[1]!, 10);
    const to = match[2] ? Number.parseInt(match[2], 10) : from;
    if (from < 1) continue;
    const slides =
      to > from && to - from <= MAX_SLIDE_RANGE
        ? Array.from({ length: to - from + 1 }, (_, offset) => from + offset)
        : [from];
    refs.push({ type: "slide-ref", text: match[0].replace(/\s+/g, " "), slides });
  }
  return refs;
}

/**
 * Merges runs into inline content. Slide references the source appends to a
 * paragraph become slide-ref inlines; text is otherwise kept exactly.
 */
function toInlines(raw: RawRun[]): Inline[] {
  // The trailing runs made only of slide-reference characters, after some real text.
  let tailStart = raw.length;
  for (let index = raw.length - 1; index >= 0; index -= 1) {
    const run = raw[index]!;
    if (run.isBreak || !SLIDE_REF_RUN.test(run.text)) break;
    tailStart = index;
  }
  const tail = raw
    .slice(tailStart)
    .map((run) => run.text)
    .join("");
  const body = raw.slice(0, tailStart);
  const bodyText = body.map((run) => run.text).join("");
  // The reference must be set apart by a space, so "HbS1" or "S1 heart sound" text is never taken.
  const hasRefs =
    tailStart < raw.length &&
    /[^\s]/.test(bodyText) &&
    SLIDE_REF_TAIL.test(/\s$/.test(bodyText) ? ` ${tail}` : tail);
  const runs = hasRefs ? body : raw;

  const inlines: Inline[] = [];
  runs.forEach((run) => {
    if (run.isBreak) {
      inlines.push({ type: "break" });
      return;
    }
    if (run.text === "") return;
    const previous = inlines.at(-1);
    if (previous?.type === "text" && sameMarks(previous.marks ?? [], run.marks)) {
      previous.text += run.text;
      return;
    }
    inlines.push(
      run.marks.length > 0
        ? { type: "text", text: run.text, marks: [...run.marks] }
        : { type: "text", text: run.text },
    );
  });

  if (hasRefs) inlines.push(...slideRefsOf(tail));
  return inlines;
}

function sameMarks(a: readonly TextMark[], b: readonly TextMark[]): boolean {
  return a.length === b.length && a.every((mark) => b.includes(mark));
}

function headingLevel(
  styleId: string | null,
  properties: Element | null,
  styles: Map<string, StyleInfo>,
): number | null {
  const direct = attr(child(properties, "w", "outlineLvl"), "w", "val");
  if (direct !== null) {
    const level = Number.parseInt(direct, 10);
    if (level >= 0 && level < 6) return level + 1;
  }
  let current = styleId;
  for (let guard = 0; current && guard < 12; guard += 1) {
    const style = styles.get(current);
    const named = /^heading\s*([1-6])$/i.exec(style?.name ?? current);
    if (named) return Number.parseInt(named[1]!, 10);
    if (
      style?.outlineLevel !== null &&
      style?.outlineLevel !== undefined &&
      style.outlineLevel < 6
    ) {
      return style.outlineLevel + 1;
    }
    current = style?.basedOn ?? null;
  }
  return null;
}

function titleRole(
  styleId: string | null,
  styles: Map<string, StyleInfo>,
): "title" | "subtitle" | null {
  if (!styleId) return null;
  const name = (styles.get(styleId)?.name ?? styleId).toLowerCase();
  if (name === "title") return "title";
  if (name === "subtitle") return "subtitle";
  return null;
}

function readRelationships(parts: Map<string, Uint8Array>, path: string) {
  const result = new Map<string, Relationship & { type: string }>();
  const bytes = parts.get(path);
  if (!bytes) return result;
  const root = parseXml(bytes, "relationships");
  for (const rel of childElements(root).filter((element) => is(element, "pr", "Relationship"))) {
    const id = plainAttr(rel, "Id");
    const target = plainAttr(rel, "Target");
    if (!id || !target) continue;
    result.set(id, {
      target,
      type: plainAttr(rel, "Type") ?? "",
      external: (plainAttr(rel, "TargetMode") ?? "").toLowerCase() === "external",
    });
  }
  return result;
}

/** Resolves a relationship target against its part's folder, staying inside the package. */
function resolvePartPath(baseDir: string, target: string): string {
  const segments = (target.startsWith("/") ? target.slice(1) : `${baseDir}/${target}`).split("/");
  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") resolved.pop();
    else resolved.push(segment);
  }
  return resolved.join("/");
}

function readStyles(bytes: Uint8Array | undefined): Map<string, StyleInfo> {
  const styles = new Map<string, StyleInfo>();
  if (!bytes) return styles;
  const root = parseXml(bytes, "styles");
  for (const style of children(root, "w", "style")) {
    const id = attr(style, "w", "styleId");
    if (!id) continue;
    const outline = attr(child(child(style, "w", "pPr"), "w", "outlineLvl"), "w", "val");
    styles.set(id, {
      name: attr(child(style, "w", "name"), "w", "val"),
      basedOn: attr(child(style, "w", "basedOn"), "w", "val"),
      outlineLevel: outline === null ? null : Number.parseInt(outline, 10),
    });
  }
  return styles;
}

/** numId → level → whether that level is numbered (true) or bulleted (false). */
function readNumbering(bytes: Uint8Array | undefined): Map<string, Map<number, boolean>> {
  const result = new Map<string, Map<number, boolean>>();
  if (!bytes) return result;
  const root = parseXml(bytes, "numbering");
  const abstract = new Map<string, Map<number, boolean>>();
  for (const definition of children(root, "w", "abstractNum")) {
    const id = attr(definition, "w", "abstractNumId");
    if (!id) continue;
    const levels = new Map<number, boolean>();
    for (const level of children(definition, "w", "lvl")) {
      const index = Number.parseInt(attr(level, "w", "ilvl") ?? "0", 10);
      const format = attr(child(level, "w", "numFmt"), "w", "val") ?? "decimal";
      levels.set(index, format !== "bullet" && format !== "none");
    }
    abstract.set(id, levels);
  }
  for (const instance of children(root, "w", "num")) {
    const id = attr(instance, "w", "numId");
    const abstractId = attr(child(instance, "w", "abstractNumId"), "w", "val");
    if (id && abstractId && abstract.has(abstractId)) result.set(id, abstract.get(abstractId)!);
  }
  return result;
}

function readCoreTitle(bytes: Uint8Array | undefined): string | null {
  if (!bytes) return null;
  try {
    const root = parseXml(bytes, "properties");
    const title = descendants(root, "dc", "title")[0]?.textContent?.trim();
    return title ? title : null;
  } catch {
    return null;
  }
}
