import {
  SEMANTIC_KINDS,
  type StudyGuideDocument,
  studyGuideTextUnits,
  unitText,
} from "@medos/parsers/model";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Blocks, SectionView } from "./content";
import type { MarkRange } from "./segments";
import { anchorText } from "./selection";
import { IMAGE_HASH, syntheticGuide } from "./test-guide";

const RESOURCE = "11111111-1111-4111-8111-111111111111";

function renderGuide(document: StudyGuideDocument, marks = new Map<string, MarkRange[]>()) {
  return render(
    <article id="study-guide-text">
      <div data-sg-section="">
        <Blocks
          blocks={document.preamble}
          parent={null}
          context={{ resourceId: RESOURCE, marks, sectionId: null, sectionLabel: "Preamble" }}
        />
      </div>
      {document.sections.map((section) => (
        <SectionView key={section.id} section={section} context={{ resourceId: RESOURCE, marks }} />
      ))}
    </article>,
  );
}

const unitElement = (container: HTMLElement, sectionId: string | null, path: string) =>
  container.querySelector<HTMLElement>(
    `[data-sg-section="${sectionId ?? ""}"] [data-unit="${CSS.escape(path)}"]`,
  );

describe("the Study Guide renderer", () => {
  it("renders every passage of source text exactly, where its address says", () => {
    const document = syntheticGuide();
    const { container } = renderGuide(document);
    const parts: (string | null)[] = [null, ...document.sections.map((section) => section.id)];
    let checked = 0;
    for (const sectionId of parts) {
      for (const [path, inlines] of studyGuideTextUnits(document, sectionId) ?? []) {
        const element = unitElement(container, sectionId, path);
        expect(element, `${sectionId}/${path}`).not.toBeNull();
        expect(anchorText(element as HTMLElement)).toBe(unitText(inlines));
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(30);
  });

  it("keeps the source's heading hierarchy below the page title, with stable ids", () => {
    renderGuide(syntheticGuide());
    const first = screen.getByRole("heading", { level: 2, name: /^1 First part/ });
    expect(first).toHaveAttribute("id", "1-first-part");
    expect(screen.getByRole("heading", { level: 3, name: "Callouts" })).toHaveAttribute(
      "id",
      "callouts",
    );
    expect(screen.getByRole("heading", { level: 4, name: "Deep heading" })).toBeInTheDocument();
    expect(first.closest("section")).toHaveAttribute("aria-labelledby", "1-first-part");
  });

  it("shows slide references verbatim, set apart, with what they refer to", () => {
    const { container } = renderGuide(syntheticGuide());
    const refs = [...container.querySelectorAll(".sg-slide-ref")];
    expect(refs.map((ref) => ref.textContent)).toEqual(["S3", "S4", "S7– S9", "S12"]);
    expect(refs[2]).toHaveAttribute("title", "Lecture slides 7–9");
  });

  it("keeps source formatting as semantic elements", () => {
    const { container } = renderGuide(syntheticGuide());
    const paragraph = unitElement(container, "1-first-part", "0") as HTMLElement;
    expect(paragraph.tagName).toBe("P");
    expect(within(paragraph).getByText("Alpha").tagName).toBe("STRONG");
    expect(within(paragraph).getByText("beta").tagName).toBe("EM");
    expect(within(paragraph).getByText("2").tagName).toBe("SUP");
    expect(paragraph.querySelector("br")).not.toBeNull();
  });

  it("shows the source's own list numbers without renumbering, nesting by level", () => {
    const { container } = renderGuide(syntheticGuide());
    const section = container.querySelector('[data-sg-section="1-first-part"]') as HTMLElement;
    const ordered = section.querySelector("ol[role=list]") as HTMLElement;
    expect(ordered.className).toContain("list-none");
    expect(within(ordered).getByText("1.")).toBeInTheDocument();
    expect(within(ordered).getByText("2.")).toBeInTheDocument();
    // "a." is nested inside item "1.".
    const nested = within(ordered).getByText("a.").closest("ol");
    expect(nested?.parentElement?.closest("li")).toHaveTextContent(/^1\.One/);
    expect(section.querySelector("ul.list-disc")).toHaveTextContent("Bullet");
  });

  it("renders tables as tables, with header cells, spans and merged cells", () => {
    renderGuide(syntheticGuide());
    const region = screen.getByRole("region", { name: "Table in 1 First part" });
    expect(region).toHaveAttribute("tabindex", "0");
    const table = within(region).getByRole("table");
    const headers = within(table).getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent)).toEqual(["Col A", "Col B"]);
    // An empty header cell is not a header.
    expect(table.querySelector("thead td")).not.toBeNull();
    expect(within(table).getByText("Wide cell").closest("td")).toHaveAttribute("colspan", "2");
    expect(within(table).getByText("Tall").closest("td")).toHaveAttribute("rowspan", "2");
    // The covered cell is not rendered; row 3 has its own two cells.
    const rows = table.querySelectorAll("tbody tr");
    expect(rows[2]?.querySelectorAll("td")).toHaveLength(2);
  });

  it("renders each semantic kind distinctly, with the source's label verbatim", () => {
    const { container } = renderGuide(syntheticGuide());
    for (const kind of SEMANTIC_KINDS) {
      const note = screen.getByRole("note", { name: `Label for ${kind}` });
      expect(note).toHaveAttribute("data-callout", kind);
      // Colour is not the only signal: each kind has an icon beside its text label.
      expect(note.querySelector("svg")).not.toBeNull();
    }
    const kinds = new Set(
      [...container.querySelectorAll("[data-callout]")].map((el) =>
        el.getAttribute("data-callout"),
      ),
    );
    expect(kinds.size).toBe(SEMANTIC_KINDS.length + 1);
  });

  it("invents no label for an unlabelled box and no kind for an unknown label", () => {
    renderGuide(syntheticGuide());
    const unlabelled = screen.getByText("Unlabelled box").closest("[role=note]") as HTMLElement;
    expect(unlabelled).toHaveAttribute("data-callout", "plain");
    expect(unlabelled).not.toHaveAttribute("aria-labelledby");
    expect(unlabelled.textContent).toBe("Unlabelled box");

    const unknown = screen.getByRole("note", { name: "KEY POINT" });
    expect(unknown).toHaveAttribute("data-callout", "plain");
  });

  it("keeps each figure with its image, caption and notes, in source order", () => {
    renderGuide(syntheticGuide());
    const image = screen.getByRole("img", { name: "Figure 1. A diagram" });
    expect(image).toHaveAttribute("src", `/api/resources/${RESOURCE}/media/${IMAGE_HASH}`);
    expect(image).toHaveAttribute("loading", "lazy");
    const figure = image.closest("figure") as HTMLElement;
    expect(within(figure).getByText("Figure 1. A diagram").closest("figcaption")).not.toBeNull();
    // The notes come straight after the figure they describe.
    const notes = screen.getByRole("note", { name: "WHAT TO SEE" });
    expect(figure.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(figure.parentElement?.contains(notes)).toBe(true);
    expect(
      screen.getByRole("button", { name: "View full size: Figure 1. A diagram" }),
    ).toBeVisible();
  });

  it("shows flows as ordered steps and keeps missing images visible", () => {
    renderGuide(syntheticGuide());
    const flow = screen.getByRole("list", { name: "Sequence" });
    expect(
      within(flow)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Start", "Middle", "End"]);
    expect(screen.getByText(/could not be shown: The image is in a format/)).toBeInTheDocument();
  });

  it("styles a section the source names, such as Golden Points", () => {
    const { container } = renderGuide(syntheticGuide());
    expect(container.querySelector('[data-sg-section="golden-points"]')).toHaveAttribute(
      "data-semantic",
      "golden-points",
    );
    expect(container.querySelector('[data-sg-section="1-first-part"]')).not.toHaveAttribute(
      "data-semantic",
    );
  });

  it("marks the user's highlights without changing the text", () => {
    const document = syntheticGuide();
    const marks = new Map<string, MarkRange[]>([
      ["1-first-part|0", [{ id: "m1", kind: "highlight", start: 2, end: 9 }]],
      ["1-first-part|h", [{ id: "m2", kind: "note", start: 0, end: 1 }]],
    ]);
    const { container } = renderGuide(document, marks);
    const pieces = [...container.querySelectorAll('[data-annotation-ids~="m1"]')];
    expect(pieces.map((piece) => piece.textContent).join("")).toBe("pha bet");
    expect(pieces.every((piece) => piece.tagName === "MARK")).toBe(true);
    expect(pieces[0]).toHaveAttribute("data-kinds", "highlight");
    expect(container.querySelector('[data-annotation-ids~="m2"]')).toHaveAttribute(
      "data-kinds",
      "note",
    );

    const paragraph = unitElement(container, "1-first-part", "0") as HTMLElement;
    const units = studyGuideTextUnits(document, "1-first-part");
    expect(anchorText(paragraph)).toBe(unitText(units?.get("0") ?? []));
  });

  it("marks the end of each section for reading progress", () => {
    const { container } = renderGuide(syntheticGuide());
    expect(
      [...container.querySelectorAll("[data-sg-end]")].map((el) => el.getAttribute("data-sg-end")),
    ).toEqual(["1-first-part", "callouts", "golden-points", "deep"]);
  });
});
