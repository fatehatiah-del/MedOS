import { unzipSync } from "fflate";

import { LIMITS, ParseError } from "../errors";

/**
 * Reads selected parts of a ZIP container (a DOCX) into memory.
 *
 * Only the requested parts are decompressed, and sizes are checked before and
 * after, so a "zip bomb" cannot exhaust memory. Nothing is ever written to disk
 * and part names are never used as file paths.
 */
export function readZipParts(
  bytes: Uint8Array,
  wanted: (name: string) => boolean,
): Map<string, Uint8Array> {
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    throw new ParseError(
      "not-a-docx",
      "This file is not a valid Word document (.docx). It may be damaged, or an older .doc file renamed.",
    );
  }

  let entries = 0;
  let declared = 0;
  let parts: Record<string, Uint8Array>;
  try {
    parts = unzipSync(bytes, {
      filter: (file) => {
        entries += 1;
        if (entries > LIMITS.maxZipEntries) throw new ZipLimitError();
        if (!wanted(file.name)) return false;
        declared += file.originalSize;
        if (declared > LIMITS.maxZipReadBytes) throw new ZipLimitError();
        return true;
      },
    });
  } catch (error) {
    if (error instanceof ZipLimitError) {
      throw new ParseError("too-large", "This document is too large or complex to import.");
    }
    throw new ParseError(
      "damaged-docx",
      "This Word document is damaged and could not be opened. Try opening and re-saving it in Word.",
    );
  }

  const result = new Map<string, Uint8Array>();
  let total = 0;
  for (const [name, data] of Object.entries(parts)) {
    total += data.byteLength;
    if (total > LIMITS.maxZipReadBytes) {
      throw new ParseError("too-large", "This document is too large or complex to import.");
    }
    result.set(name, data);
  }
  return result;
}

class ZipLimitError extends Error {}
