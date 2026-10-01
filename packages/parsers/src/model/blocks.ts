import { z } from "zod";

import { type Inline, inlinesSchema, plainText } from "./inline";
import { type MediaRef, mediaRefSchema } from "./media";

/*
 * Block content: the structure of a document body. Each block type keeps a
 * structure the source actually has (a list, a table, a labelled box) instead
 * of flattening it into paragraphs.
 */

/**
 * Semantic kinds of study content, for labelled boxes and for sections.
 * Content is given a kind only when the source names it with one of these
 * labels ("⚠ EXAM TRAP", "CLINICAL LINK", a heading "Learning Objectives"); the
 * label itself is always kept verbatim as well.
 */
export const SEMANTIC_KINDS = [
  "big-picture",
  "learning-objectives",
  "key-concepts",
  "important",
  "clinical-link",
  "exam-tip",
  "exam-trap",
  "memory-hook",
  "how-its-tested",
  "exam-snapshot",
  "golden-points",
  "what-to-see",
  "detailed-notes",
  "summary",
] as const;
export type SemanticKind = (typeof SEMANTIC_KINDS)[number];

export interface ParagraphBlock {
  type: "paragraph";
  inlines: Inline[];
}

export interface ListItem {
  inlines: Inline[];
  /** Nesting depth, 0 for the outermost level. */
  level: number;
  /** The number or label the source shows for an ordered item, e.g. "20." */
  label?: string;
}

export interface ListBlock {
  type: "list";
  ordered: boolean;
  items: ListItem[];
}

export interface TableCell {
  blocks: Block[];
  /** Columns this cell spans. Omitted for 1. */
  colSpan?: number;
  /** True for a cell covered by a vertically merged cell above it. */
  merged?: boolean;
}

export interface TableRow {
  /** A header row, as the source marks it (repeated header or all-bold row). */
  header?: boolean;
  cells: TableCell[];
}

export interface TableBlock {
  type: "table";
  rows: TableRow[];
}

/** A boxed passage. `kind` is set only when the source's own label names a known kind. */
export interface CalloutBlock {
  type: "callout";
  kind: SemanticKind | null;
  /** The label exactly as the source writes it, without its decoration, e.g. "EXAM TRAP". */
  label: string | null;
  blocks: Block[];
}

/** A step-by-step sequence the source draws as boxes joined by arrows. */
export interface FlowBlock {
  type: "flow";
  steps: Inline[][];
}

export interface ImageBlock {
  type: "image";
  media: MediaRef;
}

/** An image with the caption the source gives it, and any notes set beside it. */
export interface FigureBlock {
  type: "figure";
  media: MediaRef[];
  caption: Inline[];
  notes: Block[];
}

/** An image the source contains but MedOS could not extract, kept as a visible gap. */
export interface MissingImageBlock {
  type: "missing-image";
  reason: string;
}

export type Block =
  | ParagraphBlock
  | ListBlock
  | TableBlock
  | CalloutBlock
  | FlowBlock
  | ImageBlock
  | FigureBlock
  | MissingImageBlock;

export const blockSchema: z.ZodType<Block> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("paragraph"), inlines: inlinesSchema }),
    z.object({
      type: z.literal("list"),
      ordered: z.boolean(),
      items: z
        .array(
          z.object({
            inlines: inlinesSchema,
            level: z.number().int().min(0).max(8),
            label: z.string().optional(),
          }),
        )
        .min(1),
    }),
    z.object({
      type: z.literal("table"),
      rows: z
        .array(
          z.object({
            header: z.boolean().optional(),
            cells: z.array(
              z.object({
                blocks: z.array(blockSchema),
                colSpan: z.number().int().min(2).optional(),
                merged: z.boolean().optional(),
              }),
            ),
          }),
        )
        .min(1),
    }),
    z.object({
      type: z.literal("callout"),
      kind: z.enum(SEMANTIC_KINDS).nullable(),
      label: z.string().nullable(),
      blocks: z.array(blockSchema),
    }),
    z.object({ type: z.literal("flow"), steps: z.array(inlinesSchema).min(2) }),
    z.object({ type: z.literal("image"), media: mediaRefSchema }),
    z.object({
      type: z.literal("figure"),
      media: z.array(mediaRefSchema),
      caption: inlinesSchema,
      notes: z.array(blockSchema),
    }),
    z.object({ type: z.literal("missing-image"), reason: z.string() }),
  ]),
);

/** The plain text of blocks, one line per paragraph, row or item. */
export function blocksText(blocks: readonly Block[]): string {
  const lines: string[] = [];
  const visit = (block: Block) => {
    switch (block.type) {
      case "paragraph":
        lines.push(plainText(block.inlines));
        break;
      case "list":
        for (const item of block.items) {
          lines.push(`${item.label ? `${item.label} ` : ""}${plainText(item.inlines)}`);
        }
        break;
      case "table":
        for (const row of block.rows) {
          lines.push(row.cells.map((cell) => blocksText(cell.blocks)).join(" | "));
        }
        break;
      case "callout":
        if (block.label) lines.push(block.label);
        block.blocks.forEach(visit);
        break;
      case "flow":
        lines.push(block.steps.map(plainText).join(" → "));
        break;
      case "figure":
        lines.push(plainText(block.caption));
        block.notes.forEach(visit);
        break;
      case "image":
      case "missing-image":
        break;
    }
  };
  blocks.forEach(visit);
  return lines.filter((line) => line.trim().length > 0).join("\n");
}

/** Every image referenced by the blocks, in order. */
export function blocksMedia(blocks: readonly Block[]): MediaRef[] {
  const found: MediaRef[] = [];
  const visit = (block: Block) => {
    switch (block.type) {
      case "image":
        found.push(block.media);
        break;
      case "figure":
        found.push(...block.media);
        block.notes.forEach(visit);
        break;
      case "callout":
        block.blocks.forEach(visit);
        break;
      case "table":
        for (const row of block.rows) for (const cell of row.cells) cell.blocks.forEach(visit);
        break;
      default:
        break;
    }
  };
  blocks.forEach(visit);
  return found;
}
