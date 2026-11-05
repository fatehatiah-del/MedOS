import { LIMITS, ParseError } from "../errors";
import { sha256 } from "../media";
import type { PdfDocument } from "../model";
import { parsePdf } from "../pdf/parse";
import { type ParseResult, capSearchText } from "../result";

/*
 * Registers an original lecture given as PowerPoint (.pptx, .ppt).
 *
 * Browsers cannot show PowerPoint files, so MedOS Sync first makes a PDF of
 * the presentation (with Microsoft PowerPoint, on the computer that syncs) and
 * hands that PDF here. It is registered like any lecture PDF, and the content
 * records which PDF it describes. The PowerPoint file stays the original: it is
 * kept and downloadable unchanged; the PDF is only a copy to read it in MedOS.
 *
 * When PowerPoint could only export slide pictures, the PDF has no text of its
 * own and `pageText` (each slide's text, read from the presentation) is used
 * for the pages instead, so the lecture can still be searched.
 */

export async function parsePresentationViewCopy(
  pdfBytes: Uint8Array,
  { pageText }: { pageText?: readonly string[] } = {},
): Promise<ParseResult<PdfDocument>> {
  let result: ParseResult<PdfDocument>;
  try {
    result = await parsePdf(pdfBytes);
  } catch (error) {
    if (error instanceof ParseError) {
      throw new ParseError(
        "view-copy-unreadable",
        "The PDF made from this PowerPoint could not be read. The original is kept.",
      );
    }
    throw error;
  }
  if (pageText) {
    let total = 0;
    const pages = result.content.pages.map((page, index) => {
      if (page.text !== "" || total >= LIMITS.maxPdfTextChars) return page;
      const text = (pageText[index] ?? "")
        .replace(/[ \t]+/g, " ")
        .replace(/ *\n */g, "\n")
        .replace(/\n{2,}/g, "\n")
        .trim()
        .slice(0, LIMITS.maxPageTextChars);
      total += text.length;
      return { ...page, text };
    });
    const withText = pages.filter((page) => page.text !== "").length;
    result = {
      ...result,
      content: { ...result.content, pages },
      stats: { ...result.stats, pagesWithText: withText },
      issues:
        withText > 0 ? result.issues.filter((issue) => issue.code !== "no-text") : result.issues,
      searchText: capSearchText(pages.map((page) => page.text).join("\n\n")),
    };
  }
  const content: PdfDocument = {
    ...result.content,
    viewCopy: {
      contentHash: sha256(pdfBytes),
      sizeBytes: pdfBytes.byteLength,
      madeFrom: "powerpoint",
    },
  };
  const issues = result.issues.map((issue) =>
    issue.code === "no-text"
      ? {
          ...issue,
          message:
            "These slides have no selectable text (they may be images), so they cannot be searched yet.",
        }
      : issue,
  );
  return { ...result, content, issues };
}
