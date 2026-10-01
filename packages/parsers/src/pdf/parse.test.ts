import { describe, expect, it } from "vitest";

import { ParseError } from "../errors";
import { pdfDocumentSchema } from "../model";
import { buildPdf } from "../testing/fixtures";

import { parsePdf, pdfDate } from "./parse";

describe("PDF registration", () => {
  it("records the page count, metadata and text of each page", async () => {
    const result = await parsePdf(
      buildPdf(["Introduction to receptors", "Dose response curves"], {
        title: "Week 1 Lecture",
        author: "Lecturer",
      }),
    );
    expect(() => pdfDocumentSchema.parse(result.content)).not.toThrow();
    expect(result.content.pageCount).toBe(2);
    expect(result.content.metadata).toMatchObject({
      title: "Week 1 Lecture",
      author: "Lecturer",
      createdAt: "2026-09-28T07:15:00.000Z",
    });
    expect(result.content.pages).toEqual([
      { number: 1, text: "Introduction to receptors" },
      { number: 2, text: "Dose response curves" },
    ]);
    expect(result.stats).toEqual({ pages: 2, pagesWithText: 2 });
    expect(result.searchText).toContain("Dose response curves");
  });

  it("reports a PDF without selectable text", async () => {
    const result = await parsePdf(buildPdf([""]));
    expect(result.content.pageCount).toBe(1);
    expect(result.issues.map((issue) => issue.code)).toContain("no-text");
  });

  it("rejects a file that is not a PDF", async () => {
    await expect(
      parsePdf(new TextEncoder().encode("<html>not a pdf</html>")),
    ).rejects.toMatchObject({
      code: "not-a-pdf",
    });
  });

  it("rejects a damaged PDF with a useful message", async () => {
    const error = await parsePdf(
      new TextEncoder().encode("%PDF-1.7\n this is not really a PDF"),
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ParseError);
    expect(error).toMatchObject({
      code: "damaged-pdf",
      message: expect.stringContaining("damaged"),
    });
  });

  it("leaves the caller's bytes untouched", async () => {
    const bytes = buildPdf(["Page"]);
    const copy = bytes.slice();
    await parsePdf(bytes);
    expect(bytes).toEqual(copy);
  });
});

describe("PDF dates", () => {
  it("are read as ISO 8601 when they are well formed", () => {
    expect(pdfDate("D:20260929000355+02'00'")).toBe("2026-09-28T22:03:55.000Z");
    expect(pdfDate("D:2026")).toBe("2026-01-01T00:00:00.000Z");
    expect(pdfDate("yesterday")).toBeNull();
    expect(pdfDate(undefined)).toBeNull();
  });
});
