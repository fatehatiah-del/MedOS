import { z } from "zod";

import { type McqSet, mcqSetSchema } from "./mcq";
import { type PdfDocument, pdfDocumentSchema } from "./pdf";
import { type QuestionBank, questionBankSchema } from "./question-bank";
import { type StudyGuideDocument, studyGuideDocumentSchema } from "./study-guide";

/** The structured forms a resource can be parsed into. */
export const CONTENT_FORMATS = ["study-guide", "mcq-set", "question-bank", "pdf"] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

export type ParsedContent = StudyGuideDocument | McqSet | QuestionBank | PdfDocument;

const CONTENT_SCHEMAS = {
  "study-guide": studyGuideDocumentSchema,
  "mcq-set": mcqSetSchema,
  "question-bank": questionBankSchema,
  pdf: pdfDocumentSchema,
} satisfies Record<ContentFormat, z.ZodType>;

/**
 * Checks stored or freshly parsed content against its format's schema. Content
 * is validated when it is written and when it is read back, so nothing
 * downstream ever handles an untyped blob.
 */
export function validateContent(content: unknown): ParsedContent {
  const format = (content as { format?: unknown } | null)?.format;
  if (typeof format !== "string" || !(format in CONTENT_SCHEMAS)) {
    throw new Error("Unknown content format.");
  }
  return CONTENT_SCHEMAS[format as ContentFormat].parse(content) as ParsedContent;
}

/**
 * Something the parser noticed but could work around, reported to the user
 * with the content. `location` points at the place in the source, e.g.
 * "question 12" or "section 4-gpcr-signalling".
 */
export const parseIssueSchema = z.object({
  code: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  message: z.string().min(1),
  location: z.string().optional(),
});
export type ParseIssue = z.infer<typeof parseIssueSchema>;

/** Counts that summarise parsed content, e.g. { questions: 40, unresolved: 0 }. */
export const contentStatsSchema = z.record(z.string(), z.number().int().nonnegative());
export type ContentStats = z.infer<typeof contentStatsSchema>;
