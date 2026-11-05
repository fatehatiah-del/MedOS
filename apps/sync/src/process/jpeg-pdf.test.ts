import { parsePdf } from "@medos/parsers";
import { describe, expect, it } from "vitest";

import { jpegSize, jpegsToPdf } from "./jpeg-pdf";

// An 8 × 6 pixel colour JPEG.
const JPEG = Uint8Array.from(
  Buffer.from(
    "/9j/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAGAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABAb/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCeAGpH/9k=",
    "base64",
  ),
);

describe("PDF from slide pictures", () => {
  it("reads a JPEG's size", () => {
    expect(jpegSize(JPEG)).toEqual({ width: 8, height: 6, components: 3 });
    expect(() => jpegSize(new TextEncoder().encode("not a jpeg"))).toThrow();
  });

  it("makes a PDF with one page per picture that pdf.js opens", async () => {
    const pdf = jpegsToPdf([JPEG, JPEG, JPEG]);
    const result = await parsePdf(pdf);
    expect(result.content.pageCount).toBe(3);
    expect(result.issues.map((issue) => issue.code)).toContain("no-text");
  });

  it("refuses to make an empty PDF", () => {
    expect(() => jpegsToPdf([])).toThrow();
  });
});
