import {
  type Block,
  type ListItem,
  type StudyGuideDocument,
  type TableBlock,
  type TableCell,
  blocksText,
  plainText,
} from "@medos/parsers/model";

/*
 * Pure helpers that turn the parsed structure into what HTML needs, without
 * changing content: table cells with row spans, nested lists from levels,
 * and the contents navigation from the guide's own headings.
 */

/** A table cell as rendered: its source position and how far it spans. */
export interface LaidOutCell {
  cell: TableCell;
  /** Index of the cell in its source row; part of its text-unit path. */
  index: number;
  colSpan: number;
  rowSpan: number;
}

export interface LaidOutRow {
  header: boolean;
  /** Index of the row in the source table; part of its text-unit path. */
  index: number;
  cells: LaidOutCell[];
}

/**
 * Lays a table out for HTML. A cell the source marks as covered by a
 * vertically merged cell above it is not rendered; the cell above spans
 * down over it instead. Column spans are kept as they are.
 */
export function layoutTable(table: TableBlock): LaidOutRow[] {
  // The cell that currently owns each column, for extending row spans.
  const owners = new Map<number, LaidOutCell>();
  return table.rows.map((row, rowIndex) => {
    const cells: LaidOutCell[] = [];
    let column = 0;
    row.cells.forEach((cell, cellIndex) => {
      const colSpan = cell.colSpan ?? 1;
      const owner = owners.get(column);
      if (cell.merged && owner) {
        owner.rowSpan += 1;
      } else {
        const laidOut: LaidOutCell = { cell, index: cellIndex, colSpan, rowSpan: 1 };
        cells.push(laidOut);
        for (let offset = 0; offset < colSpan; offset += 1) owners.set(column + offset, laidOut);
      }
      column += colSpan;
    });
    return { header: row.header === true, index: rowIndex, cells };
  });
}

/** The number of columns a table spans at its widest. */
export function tableColumnCount(table: TableBlock): number {
  return Math.max(
    0,
    ...table.rows.map((row) => row.cells.reduce((sum, cell) => sum + (cell.colSpan ?? 1), 0)),
  );
}

/** Whether a cell has any text or image to show. Empty header cells are not headers. */
export function cellIsEmpty(cell: TableCell): boolean {
  return (
    blocksText(cell.blocks).trim().length === 0 &&
    !cell.blocks.some((block: Block) => block.type === "image" || block.type === "figure")
  );
}

export interface ListNode {
  item: ListItem;
  /** Index of the item in the source list; part of its text-unit path. */
  index: number;
  children: ListNode[];
}

/** Nests list items by their level, keeping source order. */
export function nestListItems(items: readonly ListItem[]): ListNode[] {
  const roots: ListNode[] = [];
  const stack: ListNode[] = [];
  items.forEach((item, index) => {
    const node: ListNode = { item, index, children: [] };
    while (stack.length > 0 && (stack[stack.length - 1] as ListNode).item.level >= item.level) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    else roots.push(node);
    stack.push(node);
  });
  return roots;
}

export interface TocEntry {
  id: string;
  /** The heading's text without its slide references, for navigation. */
  label: string;
  level: number;
  children: TocEntry[];
}

/** The heading text a navigation label shows: the source's words, without slide references. */
export function headingLabel(heading: StudyGuideDocument["sections"][number]["heading"]): string {
  return plainText(heading.filter((inline) => inline.type !== "slide-ref"))
    .replace(/\s+/g, " ")
    .trim();
}

/** The contents navigation, from the guide's own headings, nested by level. */
export function buildToc(document: StudyGuideDocument): TocEntry[] {
  const roots: TocEntry[] = [];
  const stack: TocEntry[] = [];
  for (const section of document.sections) {
    const entry: TocEntry = {
      id: section.id,
      label: headingLabel(section.heading) || section.id,
      level: section.level,
      children: [],
    };
    while (stack.length > 0 && (stack[stack.length - 1] as TocEntry).level >= section.level) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(entry);
    else roots.push(entry);
    stack.push(entry);
  }
  return roots;
}
