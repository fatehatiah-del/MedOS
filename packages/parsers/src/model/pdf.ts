import { z } from "zod";

/**
 * What MedOS records about an original lecture PDF. The PDF itself stays the
 * authoritative document; this is registration data: its pages, its own
 * metadata, and the text of each page for search and future slide links.
 */
export interface PdfDocument {
  format: "pdf";
  pageCount: number;
  metadata: {
    title: string | null;
    author: string | null;
    creator: string | null;
    producer: string | null;
    /** As the PDF states it, ISO 8601 when it could be read. */
    createdAt: string | null;
  };
  /** Text per page, in page order. Empty for a page without extractable text (e.g. a scan). */
  pages: { number: number; text: string }[];
}

export const pdfDocumentSchema: z.ZodType<PdfDocument> = z
  .object({
    format: z.literal("pdf"),
    pageCount: z.number().int().positive(),
    metadata: z.object({
      title: z.string().nullable(),
      author: z.string().nullable(),
      creator: z.string().nullable(),
      producer: z.string().nullable(),
      createdAt: z.string().nullable(),
    }),
    pages: z.array(z.object({ number: z.number().int().positive(), text: z.string() })),
  })
  .refine((document) => document.pages.length === document.pageCount, {
    message: "Every page must be listed.",
  });
