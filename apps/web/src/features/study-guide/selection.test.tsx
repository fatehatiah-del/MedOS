import { studyGuideTextUnits, unitText } from "@medos/parsers/model";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Blocks, SectionView } from "./content";
import type { MarkRange } from "./segments";
import { anchorFromSelection } from "./selection";
import { syntheticGuide } from "./test-guide";

/*
 * Selections in the rendered guide become anchors whose quote is exactly the
 * source text at those offsets: what the server checks before saving.
 */

const document_ = syntheticGuide();

function setup(marks = new Map<string, MarkRange[]>()) {
  const { container } = render(
    <article id="study-guide-text">
      <div data-sg-section="">
        <Blocks
          blocks={document_.preamble}
          parent={null}
          context={{ resourceId: "r", marks, sectionId: null, sectionLabel: "Preamble" }}
        />
      </div>
      {document_.sections.map((section) => (
        <SectionView key={section.id} section={section} context={{ resourceId: "r", marks }} />
      ))}
    </article>,
  );
  const root = container.querySelector("#study-guide-text") as HTMLElement;
  return { root };
}

const unit = (root: HTMLElement, sectionId: string, path: string) =>
  root.querySelector(`[data-sg-section="${sectionId}"] [data-unit="${path}"]`) as HTMLElement;

/** Text nodes of an element, in order. */
function textNodes(element: Node): Text[] {
  const walker = element.ownerDocument!.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  return nodes;
}

function select(start: [Node, number], end: [Node, number]) {
  const selection = window.getSelection() as Selection;
  selection.removeAllRanges();
  const range = document.createRange();
  range.setStart(...start);
  range.setEnd(...end);
  selection.addRange(range);
  return selection;
}

const sourceText = (sectionId: string, path: string) =>
  unitText(studyGuideTextUnits(document_, sectionId)?.get(path) ?? []);

describe("selections", () => {
  it("become anchors whose quote is the source text at those offsets", () => {
    const { root } = setup();
    const paragraph = unit(root, "1-first-part", "0");
    const [alpha, beta] = textNodes(paragraph);
    // From inside "Alpha" (bold) to inside "beta" (italic).
    const result = anchorFromSelection(select([alpha!, 2], [beta!, 3]), root);
    expect(result).toEqual({
      status: "anchor",
      anchor: { sectionId: "1-first-part", unitPath: "0", start: 2, end: 9, quote: "pha bet" },
    });
    if (result.status === "anchor") {
      const { start, end, quote } = result.anchor;
      expect(sourceText("1-first-part", "0").slice(start, end)).toBe(quote);
    }
  });

  it("count line breaks and slide references like the source", () => {
    const { root } = setup();
    const paragraph = unit(root, "1-first-part", "0");
    const nodes = textNodes(paragraph);
    const gamma = nodes.find((node) => node.data.startsWith("gamma"))!;
    const slides = nodes.find((node) => node.data.startsWith("S7"))!;
    const result = anchorFromSelection(select([gamma, 0], [slides, 2]), root);
    expect(result.status).toBe("anchor");
    if (result.status === "anchor") {
      expect(result.anchor.quote).toBe("gamma x2S7");
      expect(sourceText("1-first-part", "0").slice(result.anchor.start, result.anchor.end)).toBe(
        "gamma x2S7",
      );
    }
  });

  it("are unaffected by marks already in the text", () => {
    const marks = new Map<string, MarkRange[]>([
      ["1-first-part|0", [{ id: "m", kind: "highlight", start: 1, end: 4 }]],
    ]);
    const { root } = setup(marks);
    const paragraph = unit(root, "1-first-part", "0");
    const nodes = textNodes(paragraph);
    const beta = nodes.find((node) => node.data === "beta")!;
    const result = anchorFromSelection(select([beta, 0], [beta, 4]), root);
    expect(result).toMatchObject({
      status: "anchor",
      anchor: { start: 6, end: 10, quote: "beta" },
    });
  });

  it("are clamped to the one passage they cover, without surrounding space", () => {
    const { root } = setup();
    const item = unit(root, "1-first-part", "2.i0");
    const [text] = textNodes(item);
    // From the start of the text to the start of the next block, as a triple click does.
    const next = unit(root, "1-first-part", "3.r0.c1.b0");
    const result = anchorFromSelection(select([text!, 0], [next, 0]), root);
    expect(result).toEqual({
      status: "anchor",
      anchor: { sectionId: "1-first-part", unitPath: "2.i0", start: 0, end: 6, quote: "Bullet" },
    });
  });

  it("address the preamble, tables and captions", () => {
    const { root } = setup();
    const [contents] = textNodes(root.querySelector('[data-sg-section=""] [data-unit="0"]')!);
    expect(anchorFromSelection(select([contents!, 0], [contents!, 8]), root)).toMatchObject({
      anchor: { sectionId: null, unitPath: "0", quote: "CONTENTS" },
    });
    const [cell] = textNodes(unit(root, "1-first-part", "3.r1.c1.b0"));
    expect(anchorFromSelection(select([cell!, 0], [cell!, 4]), root)).toMatchObject({
      anchor: { unitPath: "3.r1.c1.b0", quote: "Wide" },
    });
    const [caption] = textNodes(unit(root, "1-first-part", "5.cap"));
    expect(anchorFromSelection(select([caption!, 0], [caption!, 6]), root)).toMatchObject({
      anchor: { unitPath: "5.cap", quote: "Figure" },
    });
  });

  it("across several passages are refused", () => {
    const { root } = setup();
    const [one] = textNodes(unit(root, "1-first-part", "1.i0"));
    const [two] = textNodes(unit(root, "1-first-part", "1.i2"));
    expect(anchorFromSelection(select([one!, 0], [two!, 2]), root)).toEqual({
      status: "multiple",
    });
  });

  it("outside the guide, or empty, are ignored", () => {
    const { root } = setup();
    const outside = document.createElement("p");
    outside.textContent = "Elsewhere";
    document.body.append(outside);
    expect(
      anchorFromSelection(select([outside.firstChild!, 0], [outside.firstChild!, 4]), root),
    ).toEqual({ status: "none" });
    const [text] = textNodes(unit(root, "1-first-part", "0"));
    expect(anchorFromSelection(select([text!, 1], [text!, 1]), root)).toEqual({ status: "none" });
    expect(anchorFromSelection(null, root)).toEqual({ status: "none" });
    outside.remove();
  });
});
