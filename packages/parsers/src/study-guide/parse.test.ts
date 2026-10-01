import { describe, expect, it } from "vitest";

import { ParseError } from "../errors";
import { sha256 } from "../media";
import {
  type Block,
  type CalloutBlock,
  type ListBlock,
  type TableBlock,
  blocksText,
  plainText,
  studyGuideDocumentSchema,
} from "../model";
import {
  buildDocx,
  heading,
  imageParagraph,
  paragraph,
  pngBytes,
  run,
  sampleStudyGuide,
  table,
} from "../testing/fixtures";

import { parseStudyGuideDocx } from "./parse";

const find = <T extends Block["type"]>(blocks: readonly Block[], type: T) =>
  blocks.filter((block): block is Extract<Block, { type: T }> => block.type === type);

describe("study guide DOCX", () => {
  const result = parseStudyGuideDocx(sampleStudyGuide());
  const guide = result.content;

  it("produces content that satisfies the schema", () => {
    expect(() => studyGuideDocumentSchema.parse(guide)).not.toThrow();
  });

  it("takes the title from the Title paragraph and keeps content before the first heading", () => {
    expect(guide.title).toBe("Receptor Basics — Study Guide");
    expect(blocksText(guide.preamble)).toBe("CONTENTS");
  });

  it("cuts sections at the source's own headings, in order, with their levels", () => {
    expect(guide.sections.map((section) => [section.level, plainText(section.heading)])).toEqual([
      [1, "1 Learning Objectives"],
      [1, "2 ReceptorsS12"],
      [2, "Summary"],
    ]);
    expect(guide.sections.map((section) => section.id)).toEqual([
      "1-learning-objectives",
      "2-receptors",
      "summary",
    ]);
  });

  it("gives a section a semantic kind only when its heading names one", () => {
    expect(guide.sections.map((section) => section.semanticKind)).toEqual([
      "learning-objectives",
      null,
      "summary",
    ]);
  });

  it("keeps slide references as provenance, apart from the heading text", () => {
    const receptors = guide.sections[1]!;
    expect(receptors.heading.at(-1)).toEqual({ type: "slide-ref", text: "S12", slides: [12] });
  });

  it("keeps paragraphs with their bold and italic text", () => {
    const [first] = find(guide.sections[1]!.blocks, "paragraph");
    expect(first?.inlines).toEqual([
      { type: "text", text: "A " },
      { type: "text", text: "receptor", marks: ["bold"] },
      { type: "text", text: " binds a " },
      { type: "text", text: "ligand", marks: ["italic"] },
      { type: "text", text: "." },
    ]);
  });

  it("reads Word-numbered bullets, typed bullets and typed numbers as lists", () => {
    const [objectives] = find(guide.sections[0]!.blocks, "list") as ListBlock[];
    expect(objectives?.ordered).toBe(false);
    expect(objectives?.items.map((item) => plainText(item.inlines))).toEqual([
      "Describe receptor families.",
      "Compare agonists and antagonists.",
    ]);

    const [typed] = find(guide.sections[1]!.blocks, "list");
    expect(typed?.items.map((item) => plainText(item.inlines))).toEqual([
      "Typed bullet one",
      "Typed bullet two",
    ]);

    const [numbered] = find(guide.sections[2]!.blocks, "list");
    expect(numbered).toMatchObject({ ordered: true });
    expect(numbered?.items.map((item) => [item.label, plainText(item.inlines)])).toEqual([
      ["1.", "First point."],
      ["2.", "Second point."],
    ]);
  });

  it("keeps tables with their rows, columns and header", () => {
    const [grid] = find(guide.sections[1]!.blocks, "table") as TableBlock[];
    expect(grid?.rows).toHaveLength(3);
    expect(grid?.rows[0]?.header).toBe(true);
    expect(grid?.rows.map((row) => row.cells.map((cell) => blocksText(cell.blocks)))).toEqual([
      ["Family", "Speed"],
      ["Ion channel", "Milliseconds"],
      ["Nuclear", "Hours"],
    ]);
  });

  it("reads a labelled one-cell box as a callout, keeping the label verbatim", () => {
    const [trap] = find(guide.sections[1]!.blocks, "callout") as CalloutBlock[];
    expect(trap).toMatchObject({ kind: "exam-trap", label: "EXAM TRAP" });
    expect(blocksText(trap!.blocks)).toBe("Affinity is not efficacy.");
  });

  it("reads steps joined by arrows as a flow", () => {
    const [flow] = find(guide.sections[1]!.blocks, "flow");
    expect(flow?.steps.map(plainText)).toEqual(["Step one", "Step two"]);
  });

  it("joins an image and its caption into a figure and extracts the image", () => {
    const [figure] = find(guide.sections[1]!.blocks, "figure");
    expect(plainText(figure!.caption)).toBe("Figure 1. Receptor families");
    expect(figure?.media).toEqual([
      {
        hash: sha256(pngBytes()),
        mimeType: "image/png",
        sizeBytes: pngBytes().byteLength,
        altText: "Receptor diagram",
      },
    ]);
    expect(result.media.map((media) => media.ref.hash)).toEqual([sha256(pngBytes())]);
    expect(result.stats).toMatchObject({
      sections: 3,
      tables: 1,
      callouts: 1,
      figures: 1,
      flows: 1,
    });
  });

  it("records searchable text", () => {
    expect(result.searchText).toContain("Affinity is not efficacy.");
    expect(result.searchText).toContain("Milliseconds");
  });
});

describe("study guide fidelity", () => {
  it("never invents headings, kinds or labels the source does not have", () => {
    const docx = buildDocx(
      [
        heading("Pharmacokinetics"),
        paragraph("Absorption depends on the route."),
        table([[paragraph("Worked example (apply the formula)") + paragraph("Half-life is 4 h.")]]),
        table([[paragraph("KEY POINT") + paragraph("Bioavailability matters.")]]),
      ].join(""),
    );
    const { content } = parseStudyGuideDocx(docx);

    expect(content.sections).toHaveLength(1);
    expect(content.sections[0]?.semanticKind).toBeNull();
    const callouts = content.sections[0]!.blocks.filter((block) => block.type === "callout");
    // An ordinary first line stays content; a capitalised label is kept but given no invented kind.
    expect(callouts).toMatchObject([
      { kind: null, label: null },
      { kind: null, label: "KEY POINT" },
    ]);
    expect(blocksText(callouts)).toContain("Worked example (apply the formula)");
  });

  it("reads a figure laid out as an image beside its caption and notes", () => {
    const docx = buildDocx(
      table([
        [
          imageParagraph("rIdA"),
          paragraph("Figure 2. The cycle") +
            paragraph("WHAT TO SEE") +
            paragraph("• GTP on means active"),
        ],
      ]),
      { images: { rIdA: { name: "a.png", bytes: pngBytes(1) } } },
    );
    const [figure] = parseStudyGuideDocx(docx).content.preamble;
    expect(figure).toMatchObject({ type: "figure" });
    if (figure?.type !== "figure") return;
    expect(plainText(figure.caption)).toBe("Figure 2. The cycle");
    expect(figure.notes).toMatchObject([
      { type: "callout", kind: "what-to-see", label: "WHAT TO SEE" },
    ]);
  });

  it("keeps slide ranges and every slide they cover, but not letters inside words", () => {
    const docx = buildDocx(
      [
        heading("Binding", 1, [run("  S52–"), run(" S55")]),
        paragraph("HbS1 is not a slide reference"),
        paragraph("The S1 heart sound is described here."),
      ].join(""),
    );
    const [section] = parseStudyGuideDocx(docx).content.sections;
    expect(section?.heading.at(-1)).toEqual({
      type: "slide-ref",
      text: "S52– S55",
      slides: [52, 53, 54, 55],
    });
    expect(blocksText(section!.blocks)).toBe(
      "HbS1 is not a slide reference\nThe S1 heart sound is described here.",
    );
    expect(JSON.stringify(section!.blocks)).not.toContain("slide-ref");
  });

  it("uses headings defined by outline level as well as by name", () => {
    const docx = buildDocx(paragraph("Einleitung", { style: "Kopf1" }) + paragraph("Text."));
    expect(parseStudyGuideDocx(docx).content.sections.map((s) => s.level)).toEqual([1]);
  });

  it("keeps a guide without headings as one passage, and says so", () => {
    const result = parseStudyGuideDocx(buildDocx(paragraph("Only text.")));
    expect(result.content.sections).toEqual([]);
    expect(blocksText(result.content.preamble)).toBe("Only text.");
    expect(result.issues.map((issue) => issue.code)).toContain("no-headings");
  });

  it("keeps merged table cells", () => {
    const docx = buildDocx(
      table([[{ xml: paragraph("Spans two"), span: 2 }], [paragraph("Left"), paragraph("Right")]]),
    );
    const [grid] = parseStudyGuideDocx(docx).content.preamble as TableBlock[];
    expect(grid?.rows[0]?.cells[0]?.colSpan).toBe(2);
    expect(grid?.rows[1]?.cells).toHaveLength(2);
  });
});

describe("study guide images and untrusted content", () => {
  it("does not extract images in formats a browser cannot safely show, and says so", () => {
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    const result = parseStudyGuideDocx(
      buildDocx(paragraph("Diagram:") + imageParagraph("rIdSvg"), {
        images: { rIdSvg: { name: "x.svg", bytes: svg } },
      }),
    );
    expect(result.media).toEqual([]);
    expect(result.content.preamble).toMatchObject([
      { type: "paragraph" },
      { type: "missing-image" },
    ]);
    expect(result.issues.map((issue) => issue.code)).toContain("image-not-imported");
  });

  it("never fetches images linked from outside the document", () => {
    const result = parseStudyGuideDocx(
      buildDocx(paragraph("Diagram:") + imageParagraph("rIdExt"), {
        externalImages: { rIdExt: "https://example.test/x.png" },
      }),
    );
    expect(result.media).toEqual([]);
    expect(result.content.preamble).toMatchObject([
      { type: "paragraph" },
      { type: "missing-image", reason: expect.stringContaining("not fetched") },
    ]);
  });

  it("ignores macros and reports them", () => {
    const result = parseStudyGuideDocx(
      buildDocx(heading("Notes") + paragraph("Text."), {
        extraParts: { "word/vbaProject.bin": new Uint8Array([1, 2, 3]) },
      }),
    );
    expect(result.issues.map((issue) => issue.code)).toContain("macros-ignored");
    expect(result.content.sections).toHaveLength(1);
  });
});

describe("malformed study guides", () => {
  const failure = (bytes: Uint8Array) => {
    try {
      parseStudyGuideDocx(bytes);
    } catch (error) {
      return error;
    }
    throw new Error("expected a parse error");
  };

  it("rejects a file that is not a DOCX with a useful message", () => {
    const error = failure(new TextEncoder().encode("plain text, not a document"));
    expect(error).toBeInstanceOf(ParseError);
    expect(error).toMatchObject({ code: "not-a-docx", message: expect.stringContaining(".docx") });
  });

  it("rejects a damaged DOCX", () => {
    const docx = sampleStudyGuide();
    expect(failure(docx.slice(0, docx.byteLength / 2))).toMatchObject({ code: "damaged-docx" });
  });

  it("refuses XML with a DTD, so entity expansion can never apply", () => {
    const bomb = `<?xml version="1.0"?><!DOCTYPE lol [<!ENTITY lol "lol">]><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>`;
    expect(failure(buildDocx("", { rawDocument: bomb }))).toMatchObject({ code: "unsafe-docx" });
  });

  it("rejects a document with no readable content", () => {
    expect(failure(buildDocx(paragraph("")))).toMatchObject({ code: "empty" });
  });

  it("never puts a path or stack trace in the message", () => {
    const error = failure(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0])) as Error;
    expect(error.message).not.toMatch(/[A-Za-z]:\\|\/Users\/|at .*\(/);
  });
});
