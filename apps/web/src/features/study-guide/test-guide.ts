import { SEMANTIC_KINDS, type StudyGuideDocument } from "@medos/parsers/model";

/*
 * A synthetic study guide for tests: invented text, structure only. It uses
 * every block type and every semantic kind, including kinds the real guides
 * may not contain, so each renders and is tested without real material.
 */

export const IMAGE_HASH = "a".repeat(64);

export function syntheticGuide(): StudyGuideDocument {
  return {
    format: "study-guide",
    title: "Synthetic Guide",
    subtitle: "Structure only",
    preamble: [
      { type: "paragraph", inlines: [{ type: "text", text: "CONTENTS", marks: ["bold"] }] },
      { type: "paragraph", inlines: [{ type: "text", text: "1 First part" }] },
    ],
    sections: [
      {
        id: "1-first-part",
        level: 1,
        heading: [
          { type: "text", text: "1 First part" },
          { type: "slide-ref", text: "S3", slides: [3] },
          { type: "slide-ref", text: "S4", slides: [4] },
        ],
        semanticKind: null,
        blocks: [
          {
            type: "paragraph",
            inlines: [
              { type: "text", text: "Alpha ", marks: ["bold"] },
              { type: "text", text: "beta", marks: ["italic"] },
              { type: "break" },
              { type: "text", text: "gamma x" },
              { type: "text", text: "2", marks: ["superscript"] },
              { type: "slide-ref", text: "S7– S9", slides: [7, 8, 9] },
            ],
          },
          {
            type: "list",
            ordered: true,
            items: [
              { level: 0, label: "1.", inlines: [{ type: "text", text: "One" }] },
              { level: 1, label: "a.", inlines: [{ type: "text", text: "One-a" }] },
              { level: 0, label: "2.", inlines: [{ type: "text", text: "Two" }] },
            ],
          },
          {
            type: "list",
            ordered: false,
            items: [{ level: 0, inlines: [{ type: "text", text: "Bullet" }] }],
          },
          {
            type: "table",
            rows: [
              {
                header: true,
                cells: [
                  { blocks: [] },
                  { blocks: [{ type: "paragraph", inlines: [{ type: "text", text: "Col A" }] }] },
                  { blocks: [{ type: "paragraph", inlines: [{ type: "text", text: "Col B" }] }] },
                ],
              },
              {
                cells: [
                  { blocks: [{ type: "paragraph", inlines: [{ type: "text", text: "Row 1" }] }] },
                  {
                    colSpan: 2,
                    blocks: [{ type: "paragraph", inlines: [{ type: "text", text: "Wide cell" }] }],
                  },
                ],
              },
              {
                cells: [
                  { blocks: [{ type: "paragraph", inlines: [{ type: "text", text: "Row 2" }] }] },
                  { blocks: [{ type: "paragraph", inlines: [{ type: "text", text: "Tall" }] }] },
                  { blocks: [{ type: "paragraph", inlines: [{ type: "text", text: "B2" }] }] },
                ],
              },
              {
                cells: [
                  { blocks: [{ type: "paragraph", inlines: [{ type: "text", text: "Row 3" }] }] },
                  { merged: true, blocks: [] },
                  { blocks: [{ type: "paragraph", inlines: [{ type: "text", text: "B3" }] }] },
                ],
              },
            ],
          },
          {
            type: "flow",
            steps: [
              [{ type: "text", text: "Start" }],
              [{ type: "text", text: "Middle" }],
              [{ type: "text", text: "End" }],
            ],
          },
          {
            type: "figure",
            media: [{ hash: IMAGE_HASH, mimeType: "image/png", sizeBytes: 10 }],
            caption: [
              { type: "text", text: "Figure 1. A diagram", marks: ["bold"] },
              { type: "slide-ref", text: "S12", slides: [12] },
            ],
            notes: [
              {
                type: "callout",
                kind: "what-to-see",
                label: "WHAT TO SEE",
                blocks: [{ type: "paragraph", inlines: [{ type: "text", text: "Look here" }] }],
              },
            ],
          },
          { type: "missing-image", reason: "The image is in a format MedOS does not show." },
          {
            type: "callout",
            kind: null,
            label: null,
            blocks: [{ type: "paragraph", inlines: [{ type: "text", text: "Unlabelled box" }] }],
          },
          {
            type: "callout",
            kind: null,
            label: "KEY POINT",
            blocks: [{ type: "paragraph", inlines: [{ type: "text", text: "Unknown label" }] }],
          },
        ],
      },
      {
        id: "callouts",
        level: 2,
        heading: [{ type: "text", text: "Callouts" }],
        semanticKind: null,
        blocks: SEMANTIC_KINDS.map((kind) => ({
          type: "callout" as const,
          kind,
          label: `Label for ${kind}`,
          blocks: [
            {
              type: "paragraph" as const,
              inlines: [{ type: "text" as const, text: `Body ${kind}` }],
            },
          ],
        })),
      },
      {
        id: "golden-points",
        level: 1,
        heading: [{ type: "text", text: "Golden Points" }],
        semanticKind: "golden-points",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [{ level: 0, label: "1.", inlines: [{ type: "text", text: "Point one" }] }],
          },
        ],
      },
      {
        id: "deep",
        level: 3,
        heading: [{ type: "text", text: "Deep heading" }],
        semanticKind: null,
        blocks: [],
      },
    ],
  };
}
