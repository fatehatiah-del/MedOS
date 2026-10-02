import { createHash } from "node:crypto";

import type { UserScope } from "@medos/database";
import { MEDIA_TYPES, type MediaType, sniffImageType } from "@medos/parsers/model";
import { ObjectMissingError, type ObjectStore } from "@medos/storage";

// Private data must never be stored by shared caches or the browser's disk cache.
const PRIVATE = { "Cache-Control": "private, no-store" };

const json = (body: unknown, status: number) => Response.json(body, { status, headers: PRIVATE });
const NOT_FOUND = () => json({ error: "Not found." }, 404);
const UNAVAILABLE = () => json({ error: "This image could not be loaded." }, 500);

const isMediaType = (value: string): value is MediaType =>
  (MEDIA_TYPES as readonly string[]).includes(value);

/**
 * Serves an image extracted from one of the signed-in user's resources.
 *
 * - No session: 401.
 * - A resource that is someone else's or does not exist, an image that does
 *   not belong to that resource, a malformed id or hash, or a missing file:
 *   the same 404, so nothing can be learned about what exists.
 * - The stored bytes must hash to the requested SHA-256 and be the image type
 *   recorded for them; otherwise nothing is sent.
 *
 * The response never names a storage key or path, is never cached, and is
 * marked so browsers do not guess another type or run it as a document.
 */
export async function resourceMediaResponse(
  scope: UserScope | null,
  resourceId: string,
  hash: string,
  store: ObjectStore,
): Promise<Response> {
  if (!scope) return json({ error: "Authentication required." }, 401);

  const media = await scope.resources.media(resourceId, hash);
  if (!media) return NOT_FOUND();
  if (!isMediaType(media.mimeType)) return UNAVAILABLE();

  let bytes: Uint8Array;
  try {
    bytes = await store.read(media.storageKey);
  } catch (error) {
    if (error instanceof ObjectMissingError) return NOT_FOUND();
    return UNAVAILABLE();
  }

  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== media.contentHash || sniffImageType(bytes) !== media.mimeType) {
    return UNAVAILABLE();
  }

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      ...PRIVATE,
      "Content-Type": media.mimeType,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
