import { buildBlocks, trimInlines } from "../docx/blocks";
import { type DocxNode, readDocx } from "../docx/reader";
import { ParseError } from "../errors";
import {
  type Block,
  type StudyGuideDocument,
  type StudyGuideSection,
  blocksMedia,
  blocksText,
  plainText,
} from "../model";
import { capSearchText, type ParseResult } from "../result";
import { looksLikeLabel, semanticKindOf } from "../semantics";

/**
 * Parses a Study Guide DOCX into sections, in source order.
 *
 * Sections are cut at the document's own headings; nothing is renamed,
 * reordered, added or summarised. Content before the first heading (such as a
 * hand-made contents page) is kept as the preamble.
 */
export function parseStudyGuideDocx(bytes: Uint8Array): ParseResult<StudyGuideDocument> {
  const docx = readDocx(bytes);
  const issues = [...docx.issues];
  let nodes: DocxNode[] = [...docx.body];

  // Title: a Title-styled paragraph, the document properties, or a title banner box at the top.
  let title: string | null = null;
  let subtitle: string | null = null;
  const titleIndex = nodes.findIndex(
    (node) => node.type === "paragraph" && node.titleRole === "title",
  );
  if (titleIndex >= 0) {
    title = textOf(nodes[titleIndex]!);
    nodes.splice(titleIndex, 1);
    const subtitleIndex = nodes.findIndex(
      (node) => node.type === "paragraph" && node.titleRole === "subtitle",
    );
    if (subtitleIndex >= 0) {
      subtitle = textOf(nodes[subtitleIndex]!);
      nodes.splice(subtitleIndex, 1);
    }
  } else {
    const bannerIndex = nodes.findIndex((node) => node.type === "table" || textOf(node) !== "");
    const banner = titleBanner(nodes[bannerIndex]);
    if (banner) {
      ({ title, subtitle } = banner);
      nodes = nodes.filter((_, index) => index !== bannerIndex);
    } else {
      title = docx.propertiesTitle;
    }
  }

  // Sections at the source's headings.
  const preambleNodes: DocxNode[] = [];
  const sectionNodes: { level: number; heading: DocxNode; body: DocxNode[] }[] = [];
  for (const node of nodes) {
    if (node.type === "paragraph" && node.headingLevel !== null && node.text.trim() !== "") {
      sectionNodes.push({ level: node.headingLevel, heading: node, body: [] });
    } else if (sectionNodes.length > 0) {
      sectionNodes.at(-1)!.body.push(node);
    } else {
      preambleNodes.push(node);
    }
  }

  const usedIds = new Set<string>();
  const sections: StudyGuideSection[] = sectionNodes.map(({ level, heading, body }) => {
    const inlines = heading.type === "paragraph" ? trimInlines(heading.inlines) : [];
    // Slide references are provenance, not part of the heading's name.
    const text = plainText(inlines.filter((inline) => inline.type !== "slide-ref"));
    return {
      id: uniqueId(slugify(text), usedIds),
      level,
      heading: inlines,
      semanticKind: semanticKindOf(text),
      blocks: buildBlocks(body),
    };
  });
  const preamble = buildBlocks(preambleNodes);

  const allBlocks: Block[] = [...preamble, ...sections.flatMap((section) => section.blocks)];
  const searchText = capSearchText(
    [
      title ?? "",
      subtitle ?? "",
      blocksText(preamble),
      ...sections.flatMap((section) => [plainText(section.heading), blocksText(section.blocks)]),
    ].join("\n"),
  );
  if (searchText.length === 0 && blocksMedia(allBlocks).length === 0) {
    throw new ParseError("empty", "This Study Guide has no readable content.");
  }
  if (sections.length === 0) {
    issues.push({
      code: "no-headings",
      message:
        "The guide has no headings, so it is kept as one continuous passage without contents.",
    });
  }

  const counts = countBlocks(allBlocks);
  return {
    content: { format: "study-guide", title, subtitle, preamble, sections },
    media: docx.media.list(),
    issues: [...issues, ...missingImageIssues(allBlocks)],
    stats: { sections: sections.length, ...counts },
    searchText,
  };
}

function textOf(node: DocxNode): string {
  return node.type === "paragraph" ? node.text.trim() : "";
}

/** A one-cell box of one to three short lines at the very top, before any heading. */
function titleBanner(
  node: DocxNode | undefined,
): { title: string; subtitle: string | null } | null {
  if (node?.type !== "table" || node.rows.length !== 1 || node.rows[0]!.cells.length !== 1)
    return null;
  const nodes = node.rows[0]!.cells[0]!.nodes;
  if (nodes.some((child) => child.type !== "paragraph" || child.images.length > 0)) return null;
  const lines = nodes.map(textOf).filter((line) => line !== "");
  if (lines.length === 0 || lines.length > 3 || lines[0]!.length > 160) return null;
  if (looksLikeLabel(lines[0]!)) return null;
  return { title: lines[0]!, subtitle: lines.length > 1 ? lines.slice(1).join(" · ") : null };
}

export function slugify(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return slug || "section";
}

function uniqueId(base: string, used: Set<string>): string {
  let id = base;
  for (let suffix = 2; used.has(id); suffix += 1) id = `${base}-${suffix}`;
  used.add(id);
  return id;
}

function countBlocks(blocks: readonly Block[]) {
  const counts = {
    tables: 0,
    lists: 0,
    callouts: 0,
    figures: 0,
    flows: 0,
    images: 0,
    missingImages: 0,
  };
  const visit = (block: Block) => {
    switch (block.type) {
      case "table":
        counts.tables += 1;
        for (const row of block.rows) for (const cell of row.cells) cell.blocks.forEach(visit);
        break;
      case "list":
        counts.lists += 1;
        break;
      case "callout":
        counts.callouts += 1;
        block.blocks.forEach(visit);
        break;
      case "figure":
        counts.figures += 1;
        counts.images += block.media.length;
        block.notes.forEach(visit);
        break;
      case "flow":
        counts.flows += 1;
        break;
      case "image":
        counts.images += 1;
        break;
      case "missing-image":
        counts.missingImages += 1;
        break;
      case "paragraph":
        break;
    }
  };
  blocks.forEach(visit);
  return counts;
}

function missingImageIssues(blocks: readonly Block[]) {
  const reasons = new Map<string, number>();
  const visit = (block: Block) => {
    if (block.type === "missing-image")
      reasons.set(block.reason, (reasons.get(block.reason) ?? 0) + 1);
    if (block.type === "callout") block.blocks.forEach(visit);
    if (block.type === "figure") block.notes.forEach(visit);
    if (block.type === "table")
      for (const row of block.rows) for (const cell of row.cells) cell.blocks.forEach(visit);
  };
  blocks.forEach(visit);
  return [...reasons].map(([reason, count]) => ({
    code: "image-not-imported",
    message:
      count === 1
        ? `1 image was not imported: ${reason}`
        : `${count} images were not imported: ${reason}`,
  }));
}
