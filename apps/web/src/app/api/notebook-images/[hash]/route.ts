import { createHash } from "node:crypto";

import { sniffImageType } from "@medos/parsers/model";
import { ObjectMissingError } from "@medos/storage";

import { getOptionalUserScope } from "@/server/session";
import { getObjectStore } from "@/server/storage";

/*
 * An image in one of the signed-in user's notebooks, addressed by its
 * SHA-256. Served only to the user who added it; anyone else, a malformed
 * hash or a missing file gets the same 404. The bytes must still hash to
 * the address and be the recorded type, and the answer is never cached by
 * shared caches nor run as a document.
 */

const PRIVATE = { "Cache-Control": "private, no-store" };
const json = (body: unknown, status: number) => Response.json(body, { status, headers: PRIVATE });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ hash: string }> },
): Promise<Response> {
  const [scope, { hash }] = await Promise.all([getOptionalUserScope(), params]);
  if (!scope) return json({ error: "Authentication required." }, 401);

  const image = await scope.notebooks.image(hash);
  if (!image) return json({ error: "Not found." }, 404);

  let bytes: Uint8Array;
  try {
    bytes = await getObjectStore().read(image.storageKey);
  } catch (error) {
    if (error instanceof ObjectMissingError) return json({ error: "Not found." }, 404);
    return json({ error: "This image could not be loaded." }, 500);
  }
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== image.contentHash || sniffImageType(bytes) !== image.mimeType) {
    return json({ error: "This image could not be loaded." }, 500);
  }

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      ...PRIVATE,
      "Content-Type": image.mimeType,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
