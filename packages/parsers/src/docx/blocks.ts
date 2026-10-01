import type { Block, Inline, ListBlock, ListItem, MediaRef, TableRow } from "../model";
import { bareLabel, looksLikeLabel, semanticKindOf } from "../semantics";
import type { DocxImage, DocxNode, DocxParagraph, DocxTable } from "./reader";

/*
 * Turns the intermediate DOCX form into content blocks, keeping the structure
 * the document actually has:
 *
 * - list paragraphs (Word numbering, or a leading "• " or "12.<tab>") → lists;
 * - a single-cell table → a callout box, labelled when its first line is a label;
 * - a one-column table of steps joined by arrows → a flow;
 * - an image with a "Figure …" caption (beside it, or just below) → a figure;
 * - any other table → a table, with its rows and columns intact.
 */

const TEXT_BULLET = /^[•▪◦●○■□‣⁃]\s*/u;
const TEXT_NUMBER = /^(\d{1,3}[.)])\t+/;
const FIGURE_CAPTION = /^(figure|fig\.)\s*\d+/i;
const ARROW = /^[↓⬇→⟶➜➔⇩⇓]+$/u;

export function buildBlocks(nodes: readonly DocxNode[]): Block[] {
  const blocks: Block[] = [];
  let list: ListBlock | null = null;
  const closeList = () => {
    if (list) blocks.push(list);
    list = null;
  };

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!;

    if (node.type === "table") {
      closeList();
      blocks.push(...tableBlocks(node));
      continue;
    }

    const item = listItemOf(node);
    if (item) {
      if (!list || list.ordered !== item.ordered) {
        closeList();
        list = { type: "list", ordered: item.ordered, items: [] };
      }
      list.items.push(item.item);
      continue;
    }
    closeList();

    // An image paragraph followed by its caption is one figure.
    const next = nodes[index + 1];
    if (
      isImageOnly(node) &&
      next?.type === "paragraph" &&
      next.images.length === 0 &&
      FIGURE_CAPTION.test(next.text.trim())
    ) {
      blocks.push(figure(node.images, next.inlines, []));
      index += 1;
      continue;
    }

    blocks.push(...paragraphBlocks(node));
  }
  closeList();
  return blocks;
}

/** A paragraph's text block (if it has text) followed by its images. */
export function paragraphBlocks(paragraph: DocxParagraph): Block[] {
  const blocks: Block[] = [];
  if (paragraph.text.trim().length > 0) {
    blocks.push({ type: "paragraph", inlines: trimInlines(paragraph.inlines) });
  }
  blocks.push(...imageBlocks(paragraph.images));
  return blocks;
}

function imageBlocks(images: readonly DocxImage[]): Block[] {
  return images.map((image): Block =>
    image.ok
      ? { type: "image", media: image.media }
      : { type: "missing-image", reason: image.reason },
  );
}

function isImageOnly(paragraph: DocxParagraph): boolean {
  return paragraph.images.length > 0 && paragraph.text.trim().length === 0;
}

function figure(images: readonly DocxImage[], caption: Inline[], notes: Block[]): Block {
  const media: MediaRef[] = images.flatMap((image) => (image.ok ? [image.media] : []));
  // An image that could not be extracted stays visible as a gap, never silently dropped.
  const missing = imageBlocks(images.filter((image) => !image.ok));
  return { type: "figure", media, caption: trimInlines(caption), notes: [...missing, ...notes] };
}

function listItemOf(paragraph: DocxParagraph): { ordered: boolean; item: ListItem } | null {
  if (paragraph.images.length > 0 || paragraph.headingLevel !== null) return null;
  const text = paragraph.text;

  if (paragraph.numbering) {
    if (text.trim().length === 0) return null;
    return {
      ordered: paragraph.numbering.ordered,
      item: { inlines: trimInlines(paragraph.inlines), level: paragraph.numbering.level },
    };
  }

  const bullet = TEXT_BULLET.exec(text);
  if (bullet && text.length > bullet[0].length) {
    return {
      ordered: false,
      item: { inlines: trimInlines(dropPrefix(paragraph.inlines, bullet[0].length)), level: 0 },
    };
  }

  const number = TEXT_NUMBER.exec(text);
  if (number && text.length > number[0].length) {
    return {
      ordered: true,
      item: {
        inlines: trimInlines(dropPrefix(paragraph.inlines, number[0].length)),
        level: 0,
        label: number[1]!,
      },
    };
  }
  return null;
}

/** Removes the first `count` characters of text (a list marker the source typed by hand). */
export function dropPrefix(inlines: readonly Inline[], count: number): Inline[] {
  let remaining = count;
  const result: Inline[] = [];
  for (const inline of inlines) {
    if (remaining > 0 && inline.type === "text") {
      if (inline.text.length <= remaining) {
        remaining -= inline.text.length;
        continue;
      }
      result.push({ ...inline, text: inline.text.slice(remaining) });
      remaining = 0;
      continue;
    }
    result.push(inline);
  }
  return result;
}

/** Removes leading and trailing whitespace-only text and breaks, keeping the text itself. */
export function trimInlines(inlines: readonly Inline[]): Inline[] {
  const result = inlines.map((inline) => ({ ...inline }));
  const blank = (inline: Inline | undefined) =>
    inline !== undefined &&
    (inline.type === "break" || (inline.type === "text" && inline.text.trim() === ""));
  while (blank(result[0])) result.shift();
  while (blank(result.at(-1))) result.pop();
  const first = result[0];
  if (first?.type === "text") first.text = first.text.replace(/^\s+/, "");
  // Trailing whitespace of the last text run, even when slide references follow it.
  for (let index = result.length - 1; index >= 0; index -= 1) {
    const inline = result[index]!;
    if (inline.type === "text") {
      inline.text = inline.text.replace(/\s+$/, "");
      break;
    }
  }
  return result.filter((inline) => inline.type !== "text" || inline.text.length > 0);
}

function cellParagraphs(nodes: readonly DocxNode[]): DocxParagraph[] {
  return nodes.filter((node): node is DocxParagraph => node.type === "paragraph");
}

function tableBlocks(table: DocxTable): Block[] {
  const rows = table.rows;
  if (rows.length === 0) return [];
  const width = Math.max(...rows.map((row) => row.cells.length));

  // A single cell: a box.
  if (rows.length === 1 && width === 1) {
    return [callout(rows[0]!.cells[0]!.nodes)];
  }

  // One column of steps separated by arrows: a flow.
  if (width === 1 && rows.length >= 3) {
    const texts = rows.map((row) =>
      cellParagraphs(row.cells[0]?.nodes ?? [])
        .map((paragraph) => paragraph.text.trim())
        .join(" ")
        .trim(),
    );
    const arrowsBetween = texts.every((text, index) =>
      index % 2 === 1 ? ARROW.test(text) : text.length > 0 && !ARROW.test(text),
    );
    const onlyText = rows.every((row) =>
      (row.cells[0]?.nodes ?? []).every(
        (node) => node.type === "paragraph" && node.images.length === 0,
      ),
    );
    if (arrowsBetween && texts.length % 2 === 1 && onlyText) {
      const steps = rows
        .filter((_, index) => index % 2 === 0)
        .map((row) => {
          const paragraphs = cellParagraphs(row.cells[0]!.nodes).filter(
            (p) => p.text.trim() !== "",
          );
          return trimInlines(
            paragraphs.flatMap((p, i) =>
              i === 0 ? p.inlines : [{ type: "break" as const }, ...p.inlines],
            ),
          );
        });
      return [{ type: "flow", steps }];
    }
  }

  // One row: an image beside its "Figure …" caption and notes.
  if (rows.length === 1 && width === 2) {
    const [left, right] = rows[0]!.cells;
    const imageCell = [left, right].find((cell) => {
      const paragraphs = cellParagraphs(cell?.nodes ?? []);
      return (
        paragraphs.some((p) => p.images.length > 0) && paragraphs.every((p) => p.text.trim() === "")
      );
    });
    const textCell = imageCell === left ? right : left;
    const textParagraphs = cellParagraphs(textCell?.nodes ?? []);
    const captionIndex = textParagraphs.findIndex((p) => p.text.trim() !== "");
    const caption = textParagraphs[captionIndex];
    if (imageCell && caption && FIGURE_CAPTION.test(caption.text.trim())) {
      const images = cellParagraphs(imageCell.nodes).flatMap((p) => p.images);
      const rest = textCell!.nodes.slice(textCell!.nodes.indexOf(caption) + 1);
      return [figure(images, caption.inlines, labelledGroup(rest))];
    }
  }

  return [genericTable(table)];
}

/** A single-cell box. Its first line becomes the label when it reads as one. */
function callout(nodes: readonly DocxNode[]): Block {
  const firstIndex = nodes.findIndex(
    (node) => node.type !== "paragraph" || node.text.trim() !== "",
  );
  const first = nodes[firstIndex];
  if (first?.type === "paragraph" && first.images.length === 0 && looksLikeLabel(first.text)) {
    return {
      type: "callout",
      kind: semanticKindOf(first.text),
      label: bareLabel(first.text),
      blocks: buildBlocks(nodes.slice(firstIndex + 1)),
    };
  }
  return { type: "callout", kind: null, label: null, blocks: buildBlocks(nodes) };
}

/** Notes beside a figure: wrapped as a labelled box when they start with a known label. */
function labelledGroup(nodes: readonly DocxNode[]): Block[] {
  const firstIndex = nodes.findIndex(
    (node) => node.type !== "paragraph" || node.text.trim() !== "",
  );
  const first = nodes[firstIndex];
  if (first?.type === "paragraph" && semanticKindOf(first.text) !== null) {
    return [
      {
        type: "callout",
        kind: semanticKindOf(first.text),
        label: bareLabel(first.text),
        blocks: buildBlocks(nodes.slice(firstIndex + 1)),
      },
    ];
  }
  return buildBlocks(nodes);
}

function genericTable(table: DocxTable): Block {
  const rows: TableRow[] = table.rows.map((row, rowIndex) => {
    const firstRowBold =
      rowIndex === 0 &&
      table.rows.length > 1 &&
      row.cells.every((cell) => {
        const paragraphs = cellParagraphs(cell.nodes).filter((p) => p.text.trim() !== "");
        return paragraphs.length > 0 && paragraphs.every((p) => p.allBold);
      });
    const result: TableRow = {
      cells: row.cells.map((cell) => ({
        blocks: buildBlocks(cell.nodes),
        ...(cell.colSpan > 1 ? { colSpan: cell.colSpan } : {}),
        ...(cell.merged ? { merged: true } : {}),
      })),
    };
    if (row.header || firstRowBold) result.header = true;
    return result;
  });
  return { type: "table", rows };
}
