import type { AnnotationView } from "@medos/database";
import type { TableBlock } from "@medos/parsers/model";
import { describe, expect, it } from "vitest";

import { buildReaderAnnotations } from "./reader-model";
import { segmentInlines, slideLabel } from "./segments";
import { buildToc, layoutTable, nestListItems, tableColumnCount } from "./structure";
import { syntheticGuide } from "./test-guide";

const cell = (text: string) => ({
  blocks: [{ type: "paragraph" as const, inlines: [{ type: "text" as const, text }] }],
});

describe("table layout", () => {
  it("turns covered cells into row spans of the cell above, keeping column spans", () => {
    const table: TableBlock = {
      type: "table",
      rows: [
        { header: true, cells: [cell("A"), cell("B"), cell("C")] },
        { cells: [cell("1"), { ...cell("wide"), colSpan: 2 }] },
        { cells: [cell("2"), cell("tall"), cell("x")] },
        { cells: [cell("3"), { merged: true, blocks: [] }, cell("y")] },
        { cells: [cell("4"), { merged: true, blocks: [] }, cell("z")] },
      ],
    };
    const rows = layoutTable(table);
    expect(rows.map((row) => row.cells.map((c) => [c.index, c.colSpan, c.rowSpan]))).toEqual([
      [
        [0, 1, 1],
        [1, 1, 1],
        [2, 1, 1],
      ],
      [
        [0, 1, 1],
        [1, 2, 1],
      ],
      [
        [0, 1, 1],
        [1, 1, 3],
        [2, 1, 1],
      ],
      [
        [0, 1, 1],
        [2, 1, 1],
      ],
      [
        [0, 1, 1],
        [2, 1, 1],
      ],
    ]);
    expect(rows[0]?.header).toBe(true);
    expect(tableColumnCount(table)).toBe(3);
  });

  it("keeps a merged cell with nothing above it", () => {
    const rows = layoutTable({
      type: "table",
      rows: [{ cells: [{ merged: true, ...cell("m") }] }],
    });
    expect(rows[0]?.cells).toHaveLength(1);
  });
});

describe("lists", () => {
  it("nest by level in source order", () => {
    const tree = nestListItems([
      { level: 0, inlines: [] },
      { level: 1, inlines: [] },
      { level: 2, inlines: [] },
      { level: 1, inlines: [] },
      { level: 0, inlines: [] },
    ]);
    const shape = (nodes: typeof tree): unknown =>
      nodes.map((node) => [node.index, shape(node.children)]);
    expect(shape(tree)).toEqual([
      [
        0,
        [
          [1, [[2, []]]],
          [3, []],
        ],
      ],
      [4, []],
    ]);
  });
});

describe("contents navigation", () => {
  it("comes from the guide's own headings, nested, without slide references", () => {
    const toc = buildToc(syntheticGuide());
    expect(toc.map((entry) => [entry.id, entry.label, entry.children.map((c) => c.id)])).toEqual([
      ["1-first-part", "1 First part", ["callouts"]],
      ["golden-points", "Golden Points", ["deep"]],
    ]);
  });
});

describe("segments", () => {
  it("split text at mark boundaries and rejoin to the source exactly", () => {
    const pieces = segmentInlines(
      [
        { type: "text", text: "Hello ", marks: ["bold"] },
        { type: "break" },
        { type: "slide-ref", text: "S2", slides: [2] },
      ],
      [
        { id: "a", kind: "highlight", start: 3, end: 8 },
        { id: "b", kind: "note", start: 4, end: 5 },
      ],
    );
    const text = pieces
      .map((piece) =>
        piece.type === "text"
          ? piece.text
          : piece.type === "break"
            ? "\n"
            : piece.pieces.map((inner) => inner.text).join(""),
      )
      .join("");
    expect(text).toBe("Hello \nS2");
    const marked = pieces.flatMap((piece) =>
      piece.type === "text" && piece.annotations.length > 0
        ? [[piece.text, piece.annotations.map((range) => range.id)]]
        : piece.type === "slide-ref"
          ? piece.pieces
              .filter((p) => p.annotations.length > 0)
              .map((p) => [p.text, p.annotations.map((r) => r.id)])
          : [],
    );
    expect(marked).toEqual([
      ["l", ["a"]],
      ["o", ["a", "b"]],
      [" ", ["a"]],
      ["S", ["a"]],
    ]);
    expect(pieces.find((piece) => piece.type === "break")?.annotations.map((r) => r.id)).toEqual([
      "a",
    ]);
  });

  it("read slide references aloud plainly", () => {
    expect(slideLabel([17])).toBe("slide 17");
    expect(slideLabel([52, 53, 54, 55])).toBe("slides 52–55");
    expect(slideLabel([17, 18, 40])).toBe("slides 17, 18 and 40");
  });
});

describe("reader annotations", () => {
  const at = new Date("2026-10-02T10:00:00Z");
  const base = {
    resourceId: "r",
    prefix: "",
    suffix: "",
    note: null,
    createdAt: at,
    updatedAt: at,
  };

  it("resolve against the guide and collect marks per passage", () => {
    const annotations: AnnotationView[] = [
      {
        ...base,
        id: "h",
        kind: "highlight",
        sectionId: "1-first-part",
        unitPath: "0",
        startOffset: 0,
        endOffset: 5,
        quote: "Alpha",
      },
      {
        ...base,
        id: "s",
        kind: "bookmark",
        sectionId: "callouts",
        unitPath: null,
        startOffset: null,
        endOffset: null,
        quote: "Callouts",
      },
      {
        ...base,
        id: "o",
        kind: "note",
        note: "Mine",
        sectionId: "1-first-part",
        unitPath: "0",
        startOffset: 0,
        endOffset: 5,
        quote: "Text that is not in the guide",
      },
    ];
    const { list, marks } = buildReaderAnnotations(syntheticGuide(), annotations);
    expect(list.map((item) => [item.id, item.status, item.sectionLabel])).toEqual([
      ["h", "text", "1 First part"],
      ["s", "section", "Callouts"],
      ["o", "orphaned", null],
    ]);
    expect(marks.get("1-first-part|0")).toEqual([{ id: "h", kind: "highlight", start: 0, end: 5 }]);
    expect(list[2]?.note).toBe("Mine");
  });
});
