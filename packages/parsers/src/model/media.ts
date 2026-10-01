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
