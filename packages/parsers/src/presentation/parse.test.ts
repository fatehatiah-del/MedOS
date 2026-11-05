import { describe, expect, it } from "vitest";

import { sha256 } from "../media";
import { pdfDocumentSchema } from "../model";
import { buildPdf } from "../testing/fixtures";

import { parsePresentationViewCopy } from "./parse";

describe("PowerPoint view copy registration", () => {
  it("registers the PDF made from a presentation and records which PDF it is", async () => {
    const pdf = buildPdf(["Transfusion", "ABO compatibility", ""]);
    const result = await parsePresentationViewCopy(pdf);
    expect(() => pdfDocumentSchema.parse(result.content)).not.toThrow();
    expect(result.content.pageCount).toBe(3);
    expect(result.content.viewCopy).toEqual({
      contentHash: sha256(pdf),
      sizeBytes: pdf.byteLength,
      madeFrom: "powerpoint",
    });
    expect(result.media).toEqual([]);
    expect(result.searchText).toContain("ABO compatibility");
  });

  it("uses the slides' own text for pages that are pictures", async () => {
    const result = await parsePresentationViewCopy(buildPdf(["Has text", "", ""]), {
      pageText: ["ignored: the page has text", "  Platelets  \n\n  vWF ", ""],
    });
    expect(result.content.pages).toEqual([
      { number: 1, text: "Has text" },
      { number: 2, text: "Platelets\nvWF" },
      { number: 3, text: "" },
    ]);
    expect(result.stats).toMatchObject({ pagesWithText: 2 });
    expect(result.issues.map((issue) => issue.code)).not.toContain("no-text");
    expect(result.searchText).toContain("vWF");
  });

  it("speaks of slides when none has text", async () => {
    const result = await parsePresentationViewCopy(buildPdf([""]));
    expect(result.issues.find((issue) => issue.code === "no-text")?.message).toContain("slides");
  });

  it("rejects bytes that are not a PDF with a message about the PowerPoint", async () => {
    await expect(
      parsePresentationViewCopy(new TextEncoder().encode("PK not a pdf")),
    ).rejects.toMatchObject({ code: "view-copy-unreadable" });
  });

  it("rejects a view copy that does not match the schema", () => {
    expect(() =>
      pdfDocumentSchema.parse({
        format: "pdf",
        pageCount: 1,
        metadata: { title: null, author: null, creator: null, producer: null, createdAt: null },
        pages: [{ number: 1, text: "" }],
        viewCopy: { contentHash: "nope", sizeBytes: 1, madeFrom: "powerpoint" },
      }),
    ).toThrow();
  });
});
