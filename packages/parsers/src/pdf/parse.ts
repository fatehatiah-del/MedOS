import type * as PdfJsModule from "pdfjs-dist/legacy/build/pdf.mjs";

import { LIMITS, ParseError } from "../errors";
import type { ParseIssue, PdfDocument } from "../model";
import { capSearchText, type ParseResult } from "../result";

/*
 * Registers an original lecture PDF: page count, the PDF's own metadata, and
 * the text of each page (for search and future Study Guide ↔ slide links).
 *
 * The PDF is never rendered here and none of its active content runs: pdf.js 6
 * evaluates no code, fonts and network access are disabled, and annotations, forms
 * and attachments are not read. The PDF itself remains the document the user
 * reads; this is only a description of it.
 */

type PdfJs = typeof PdfJsModule;

let pdfjs: Promise<PdfJs> | null = null;
function loadPdfJs(): Promise<PdfJs> {
  pdfjs ??= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjs;
}

export async function parsePdf(bytes: Uint8Array): Promise<ParseResult<PdfDocument>> {
  if (!startsWithPdfHeader(bytes)) {
    throw new ParseError(
      "not-a-pdf",
      "This file is not a valid PDF. It may be damaged or in another format.",
    );
  }

  const { getDocument } = await loadPdfJs();
  // pdf.js may take ownership of the buffer it is given, so it gets a copy.
  const task = getDocument({
    data: bytes.slice(),
    disableFontFace: true,
    useSystemFonts: false,
    useWorkerFetch: false,
    isOffscreenCanvasSupported: false,
    stopAtErrors: false,
    verbosity: 0,
  });

  try {
    let document;
    try {
      document = await task.promise;
    } catch (error) {
      const name = (error as { name?: string } | null)?.name;
      if (name === "PasswordException") {
        throw new ParseError(
          "pdf-password",
          "This PDF is password-protected, so MedOS cannot read it.",
        );
      }
      throw new ParseError("damaged-pdf", "This PDF is damaged and could not be opened.");
    }

    const issues: ParseIssue[] = [];
    const info = ((await document.getMetadata().catch(() => null))?.info ?? {}) as Record<
      string,
      unknown
    >;

    const pages: PdfDocument["pages"] = [];
    let totalChars = 0;
    let unreadable = 0;
    for (let number = 1; number <= document.numPages; number += 1) {
      let text = "";
      if (totalChars < LIMITS.maxPdfTextChars) {
        try {
          const page = await document.getPage(number);
          const content = await page.getTextContent();
          text = content.items
            .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : ""))
            .join("")
            .replace(/[ \t]+/g, " ")
            .replace(/ *\n */g, "\n")
            .trim()
            .slice(0, LIMITS.maxPageTextChars);
          page.cleanup();
        } catch {
          unreadable += 1;
        }
      }
      totalChars += text.length;
      pages.push({ number, text });
    }

    const empty = pages.filter((page) => page.text === "").length;
    if (unreadable > 0) {
      issues.push({
        code: "pages-unreadable",
        message: `${unreadable} page${unreadable === 1 ? "" : "s"} could not be read for text. The PDF itself is unaffected.`,
      });
    }
    if (empty === pages.length) {
      issues.push({
        code: "no-text",
        message:
          "This PDF has no selectable text (it may be scanned), so it cannot be searched yet.",
      });
    }
    if (totalChars >= LIMITS.maxPdfTextChars) {
      issues.push({
        code: "text-truncated",
        message: "This PDF has more text than MedOS indexes; the rest was not indexed.",
      });
    }

    const content: PdfDocument = {
      format: "pdf",
      pageCount: document.numPages,
      metadata: {
        title: metaString(info.Title),
        author: metaString(info.Author),
        creator: metaString(info.Creator),
        producer: metaString(info.Producer),
        createdAt: pdfDate(info.CreationDate),
      },
      pages,
    };
    return {
      content,
      media: [],
      issues,
      stats: { pages: document.numPages, pagesWithText: pages.length - empty },
      searchText: capSearchText(pages.map((page) => page.text).join("\n\n")),
    };
  } finally {
    await task.destroy();
  }
}

function startsWithPdfHeader(bytes: Uint8Array): boolean {
  // The header may follow a little leading garbage; readers accept it within the first 1 KB.
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  return head.includes("%PDF-");
}

function metaString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return cleaned === "" ? null : cleaned.slice(0, 500);
}

/** A PDF date ("D:20260929000355+02'00'") as ISO 8601, or null when it is not one. */
export function pdfDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(Z|[+-]\d{2}'?\d{2}'?)?/.exec(
    value.trim(),
  );
  if (!match) return null;
  const [, year, month = "01", day = "01", hour = "00", minute = "00", second = "00", zone] = match;
  let offset = "Z";
  if (zone && zone !== "Z") {
    const digits = zone.replace(/'/g, "");
    offset = `${digits.slice(0, 3)}:${digits.slice(3, 5)}`;
  }
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}
