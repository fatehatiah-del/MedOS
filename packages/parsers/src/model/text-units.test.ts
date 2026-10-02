import { describe, expect, it } from "vitest";

import type { StudyGuideDocument } from "./study-guide";
import {
  type TextAnchor,
  anchorContext,
  isUnitPath,
  resolveAnchor,
  studyGuideTextUnits,
  unitText,
} from "./text-units";

/* Invented content: structure only. */
const guide: StudyGuideDocument = {
  format: "study-guide",
  title: "Synthetic guide",
  subtitle: null,
  preamble: [{ type: "paragraph", inlines: [{ type: "text", text: "CONTENTS" }] }],
  sections: [
    {
      id: "1-alpha",
      level: 1,
      heading: [
        { type: "text", text: "1 Alpha" },
        { type: "slide-ref", text: "S4", slides: [4] },
      ],
      semanticKind: null,
      blocks: [
        {
          type: "paragraph",
          inlines: [
            { type: "text", text: "Ligand ", marks: ["bold"] },
            { type: "text", text: "binds" },
            { type: "break" },
            { type: "text", text: "receptor." },
          ],
        },
        {
          type: "list",
          ordered: true,
          items: [
            { level: 0, label: "1.", inlines: [{ type: "text", text: "First point" }] },
            { level: 0, label: "2.", inlines: [{ type: "text", text: "Second point" }] },
          ],
        },
        {
          type: "callout",
          kind: "exam-trap",
          label: "EXAM TRAP",
          blocks: [{ type: "paragraph", inlines: [{ type: "text", text: "Trap text binds." }] }],
        },
        {
          type: "table",
          rows: [
            {
              header: true,
              cells: [
                { blocks: [] },
                { blocks: [{ type: "paragraph", inlines: [{ type: "text", text: "Column" }] }] },
              ],
            },
            {
              cells: [
                { blocks: [{ type: "paragraph", inlines: [{ type: "text", text: "Row" }] }] },
                {
                  blocks: [{ type: "paragraph", inlines: [{ type: "text", text: "Cell binds" }] }],
                },
              ],
            },
          ],
        },
        {
          type: "flow",
          steps: [[{ type: "text", text: "Step A" }], [{ type: "text", text: "Step B" }]],
        },
        {
          type: "figure",
          media: [],
          caption: [{ type: "text", text: "Figure 1. Caption" }],
          notes: [
            {
              type: "callout",
              kind: "what-to-see",
              label: "WHAT TO SEE",
              blocks: [{ type: "paragraph", inlines: [{ type: "text", text: "A note" }] }],
            },
          ],
        },
      ],
    },
    {
      id: "2-beta",
      level: 1,
      heading: [{ type: "text", text: "2 Beta" }],
      semanticKind: null,
      blocks: [{ type: "paragraph", inlines: [{ type: "text", text: "Beta binds too." }] }],
    },
  ],
};

describe("text units", () => {
  it("address every readable passage of a section, in reading order", () => {
    const units = studyGuideTextUnits(guide, "1-alpha");
    expect([...(units?.keys() ?? [])]).toEqual([
      "h",
      "0",
      "1.i0",
      "1.i1",
      "2.b0",
      "3.r0.c1.b0",
      "3.r1.c0.b0",
      "3.r1.c1.b0",
      "4.s0",
      "4.s1",
      "5.cap",
      "5.n.b0.b0",
    ]);
    expect(unitText(units?.get("h") ?? [])).toBe("1 AlphaS4");
    // A line break counts as one character, so offsets match the rendered text.
    expect(unitText(units?.get("0") ?? [])).toBe("Ligand binds\nreceptor.");
  });

  it("address the preamble separately, and nothing for an unknown section", () => {
    expect([...(studyGuideTextUnits(guide, null)?.keys() ?? [])]).toEqual(["0"]);
    expect(studyGuideTextUnits(guide, "missing")).toBeNull();
  });

  it("accept only well-formed paths", () => {
    for (const path of ["h", "0", "12.i3", "3.r1.c2.b0", "5.cap", "5.n.b0.b1", "2.b0.b1"]) {
      expect(isUnitPath(path), path).toBe(true);
    }
    for (const path of ["", "x", "1.", "1..2", "-1", "1.i", "../1", "1.r1", "h.0", "1 OR 1"]) {
      expect(isUnitPath(path), path).toBe(false);
    }
  });
});

function anchorAt(sectionId: string, unitPath: string, start: number, end: number): TextAnchor {
  const text = unitText(studyGuideTextUnits(guide, sectionId)?.get(unitPath) ?? []);
  return {
    sectionId,
    unitPath,
    start,
    end,
    quote: text.slice(start, end),
    ...anchorContext(text, start, end),
  };
}

describe("anchors", () => {
  it("resolve exactly where they were made", () => {
    const anchor = anchorAt("1-alpha", "0", 7, 12);
    expect(anchor.quote).toBe("binds");
    expect(resolveAnchor(guide, anchor)).toEqual({
      status: "text",
      sectionId: "1-alpha",
      unitPath: "0",
      start: 7,
      end: 12,
    });
  });

  it("find their quote again when the text has moved", () => {
    const anchor = { ...anchorAt("1-alpha", "3.r1.c1.b0", 5, 10), unitPath: "9" };
    expect(resolveAnchor(guide, anchor)).toMatchObject({
      status: "text",
      sectionId: "1-alpha",
      unitPath: "3.r1.c1.b0",
      start: 5,
    });
  });

  it("prefer the occurrence whose surrounding text matches", () => {
    // "binds" occurs in several units of the section; the context picks the trap.
    const anchor = { ...anchorAt("1-alpha", "2.b0", 10, 15), unitPath: "0", start: 0, end: 5 };
    expect(resolveAnchor(guide, anchor)).toMatchObject({ unitPath: "2.b0", start: 10 });
  });

  it("look in other sections when their own section is gone", () => {
    const anchor = { ...anchorAt("2-beta", "0", 0, 4), sectionId: "renamed" };
    expect(resolveAnchor(guide, anchor)).toMatchObject({ sectionId: "2-beta", unitPath: "0" });
  });

  it("are orphaned rather than attached to the wrong words", () => {
    const anchor = { ...anchorAt("1-alpha", "0", 0, 6), quote: "Not in this guide" };
    expect(resolveAnchor(guide, anchor)).toEqual({ status: "orphaned" });
  });

  it("on a whole section resolve while it exists, or by its heading", () => {
    const section: TextAnchor = {
      sectionId: "2-beta",
      unitPath: null,
      start: null,
      end: null,
      quote: "2 Beta",
      prefix: "",
      suffix: "",
    };
    expect(resolveAnchor(guide, section)).toEqual({ status: "section", sectionId: "2-beta" });
    expect(resolveAnchor(guide, { ...section, sectionId: "old-id" })).toEqual({
      status: "section",
      sectionId: "2-beta",
    });
    expect(resolveAnchor(guide, { ...section, sectionId: "old-id", quote: "Gone" })).toEqual({
      status: "orphaned",
    });
  });
});
