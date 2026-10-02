import { z } from "zod";

/**
 * Image types MedOS extracts from imported documents. Raster formats only:
 * SVG can carry script, and Windows metafiles cannot be shown in a browser.
 */
export const MEDIA_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

/**
 * An image inside parsed content. It names the image by the SHA-256 of its
 * bytes; the bytes are kept in MedOS storage and reached only through MedOS.
 */
export const mediaRefSchema = z.object({
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  mimeType: z.enum(MEDIA_TYPES),
  sizeBytes: z.number().int().nonnegative(),
  /** Description the source gives for the image, if any. */
  altText: z.string().optional(),
});

export type MediaRef = z.infer<typeof mediaRefSchema>;

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
