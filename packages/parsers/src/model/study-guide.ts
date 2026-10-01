import { z } from "zod";

import { type Block, SEMANTIC_KINDS, type SemanticKind, blockSchema } from "./blocks";
import { type Inline, inlinesSchema } from "./inline";

/**
 * A section of a study guide: one heading of the source and the content up to
 * the next heading of the same or a higher level. Sections are stored in
 * source order with their level, so the table of contents is derived from the
 * source's own headings.
 */
export interface StudyGuideSection {
  /** Stable within the document, derived from the heading text, e.g. "4-gpcr-signalling". */
  id: string;
  /** 1 for a top-level heading. */
  level: number;
  heading: Inline[];
  /** Set only when the heading itself names a known kind ("Learning Objectives", "Summary"). */
  semanticKind: SemanticKind | null;
  blocks: Block[];
}

export interface StudyGuideDocument {
  format: "study-guide";
  /** The document's own title, if it states one. */
  title: string | null;
  subtitle: string | null;
  /** Content before the first heading, such as the source's own contents page. */
  preamble: Block[];
  sections: StudyGuideSection[];
}

export const studyGuideSectionSchema: z.ZodType<StudyGuideSection> = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  level: z.number().int().min(1).max(6),
  heading: inlinesSchema,
  semanticKind: z.enum(SEMANTIC_KINDS).nullable(),
  blocks: z.array(blockSchema),
});

export const studyGuideDocumentSchema: z.ZodType<StudyGuideDocument> = z
  .object({
    format: z.literal("study-guide"),
    title: z.string().nullable(),
    subtitle: z.string().nullable(),
    preamble: z.array(blockSchema),
    sections: z.array(studyGuideSectionSchema),
  })
  .refine(
    (document) =>
      new Set(document.sections.map((section) => section.id)).size === document.sections.length,
    { message: "Section ids must be unique." },
  );
