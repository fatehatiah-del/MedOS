import { createHash } from "node:crypto";

import { LIMITS } from "./errors";
import { type MediaRef, sniffImageType } from "./model";

/** An image extracted from a document: its bytes, to be stored, and how content refers to it. */
export interface ExtractedMedia {
  ref: MediaRef;
  bytes: Uint8Array;
}

export function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** A short, stable fingerprint of some text, used to recognise a question after a re-import. */
export function fingerprint(text: string): string {
  return sha256(text.normalize("NFC").replace(/\s+/g, " ").trim()).slice(0, 16);
}

// Defined with the model, so code that serves images can check them without loading the parsers.
export { sniffImageType };

export type MediaOutcome = { ok: true; media: ExtractedMedia } | { ok: false; reason: string };

/** Accepts image bytes as media, or says why not. */
export function toMedia(bytes: Uint8Array, altText?: string): MediaOutcome {
  if (bytes.byteLength > LIMITS.maxImageBytes) {
    return { ok: false, reason: "The image is too large to import." };
  }
  const mimeType = sniffImageType(bytes);
  if (!mimeType) {
    return {
      ok: false,
      reason: "The image is in a format MedOS does not show (only PNG, JPEG, GIF and WebP).",
    };
  }
  const ref: MediaRef = { hash: sha256(bytes), mimeType, sizeBytes: bytes.byteLength };
  const alt = altText?.trim();
  if (alt) ref.altText = alt;
  return { ok: true, media: { ref, bytes } };
}

/** Collects extracted images, once per distinct content. */
export class MediaCollector {
  private readonly byHash = new Map<string, ExtractedMedia>();

  add(media: ExtractedMedia): MediaRef {
    if (!this.byHash.has(media.ref.hash)) this.byHash.set(media.ref.hash, media);
    return media.ref;
  }

  list(): ExtractedMedia[] {
    return [...this.byHash.values()];
  }
}
