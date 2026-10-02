import { createHash } from "node:crypto";

import type { UserScope } from "@medos/database";
import { ObjectMissingError, type ObjectStore } from "@medos/storage";

// Private data must never be stored by shared caches or the browser's disk cache.
const PRIVATE = { "Cache-Control": "private, no-store" };

const json = (body: unknown, status: number) => Response.json(body, { status, headers: PRIVATE });
const NOT_FOUND = () => json({ error: "Not found." }, 404);
const UNAVAILABLE = () => json({ error: "This file could not be loaded." }, 500);

const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
const isPdf = (bytes: Uint8Array) => PDF_HEADER.every((byte, index) => bytes[index] === byte);

/** A Content-Disposition header that carries any file name safely (RFC 6266 / 5987). */
export function contentDisposition(kind: "inline" | "attachment", filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Serves the original PDF of one of the signed-in user's lectures.
 *
 * - No session: 401.
 * - Anything that is not the user's original lecture PDF (someone else's,
 *   another kind of material, a malformed id, a missing file): the same 404.
 * - The stored bytes must hash to the SHA-256 recorded at import and be a
 *   PDF; otherwise nothing is sent.
 *
 * Never cached, never sniffed, sandboxed if opened directly, and never says
 * where the file is stored. `download` asks the browser to save it.
 */
export async function resourceFileResponse(
  scope: UserScope | null,
  resourceId: string,
  store: ObjectStore,
  { download = false }: { download?: boolean } = {},
): Promise<Response> {
  if (!scope) return json({ error: "Authentication required." }, 401);

  const file = await scope.originalLectures.file(resourceId);
  if (!file) return NOT_FOUND();

  let bytes: Uint8Array;
  try {
    bytes = await store.read(file.storageKey);
  } catch (error) {
    if (error instanceof ObjectMissingError) return NOT_FOUND();
    return UNAVAILABLE();
  }

  if (createHash("sha256").update(bytes).digest("hex") !== file.contentHash || !isPdf(bytes)) {
    return UNAVAILABLE();
  }

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      ...PRIVATE,
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": contentDisposition(
        download ? "attachment" : "inline",
        file.originalFilename,
      ),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
