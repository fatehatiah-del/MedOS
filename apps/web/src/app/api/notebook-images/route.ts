import { createHash } from "node:crypto";

import { sniffImageType } from "@medos/parsers/model";
import { contentKey } from "@medos/storage";

import { NOTEBOOK_IMAGE_MAX_BYTES, notebookImageSrc } from "@/features/notebook/document";
import { getOptionalUserScope } from "@/server/session";
import { getObjectStore } from "@/server/storage";

/*
 * Adding an image to a notebook (pasted, dropped or chosen from the device).
 *
 * Signed-in users only, from MedOS's own pages. The type is read from the
 * bytes (PNG, JPEG, GIF or WebP; never SVG), the bytes are kept in MedOS
 * storage under their SHA-256, and the image is recorded as the user's, so
 * only they are ever served it. The answer is the address the notebook uses.
 */

const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: "Not allowed." }, 403);
  }
  const scope = await getOptionalUserScope();
  if (!scope) return json({ error: "Sign in to add images." }, 401);

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > NOTEBOOK_IMAGE_MAX_BYTES + 64 * 1024) {
    return json({ error: "This image is too large (10 MB at most)." }, 413);
  }

  let file: File | null = null;
  try {
    const value = (await request.formData()).get("image");
    file = value instanceof File ? value : null;
  } catch {
    file = null;
  }
  if (!file || file.size === 0) return json({ error: "No image was sent." }, 400);
  if (file.size > NOTEBOOK_IMAGE_MAX_BYTES) {
    return json({ error: "This image is too large (10 MB at most)." }, 413);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = sniffImageType(bytes);
  if (!mimeType) return json({ error: "Only PNG, JPEG, GIF and WebP images can be added." }, 415);

  const hash = createHash("sha256").update(bytes).digest("hex");
  const storageKey = contentKey(hash);
  try {
    await getObjectStore().putBytes(storageKey, bytes);
    await scope.notebooks.recordImage({
      contentHash: hash,
      storageKey,
      mimeType,
      sizeBytes: bytes.byteLength,
    });
  } catch {
    return json({ error: "The image could not be saved. Try again." }, 500);
  }
  return json({ src: notebookImageSrc(hash) }, 201);
}
