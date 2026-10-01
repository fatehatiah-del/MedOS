import { createHash } from "node:crypto";

import { LIMITS } from "./errors";
import type { MediaRef, MediaType } from "./model";

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

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  signature.every((byte, index) => bytes[offset + index] === byte);

/**
 * The image type, read from the bytes themselves rather than a name or a
 * declared type. Anything other than PNG, JPEG, GIF or WebP is refused.
 */
export function sniffImageType(bytes: Uint8Array): MediaType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }
  return null;
}

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
