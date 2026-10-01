import { z } from "zod";

import { type Inline, inlinesSchema } from "./inline";
import { type MediaRef, mediaRefSchema } from "./media";

/**
 * The correct answer of an imported question, as the source states it. When
 * the source does not state one MedOS can read with certainty, the answer is
 * unresolved and says why; MedOS never guesses an answer.
 */
export type McqAnswer =
  { status: "resolved"; optionIndex: number } | { status: "unresolved"; reason: string };

export interface McqOption {
  /** "A", "B", … in source order. */
  label: string;
  text: Inline[];
  /** Why this option is wrong, when the source explains it. */
  explanation: Inline[] | null;
}

export interface McqQuestion {
  /** Stable within the set: "q" + the question's position in the source. */
  key: string;
  /** Position in the source, from 1. */
  number: number;
  /** SHA-256 prefix of the question's text and options, to recognise it after a re-import. */
  fingerprint: string;
  stem: Inline[];
  options: McqOption[];
  answer: McqAnswer;
  /** The source's explanation of the correct answer. */
  explanation: Inline[] | null;
  topic: string | null;
  /** The source's own type label, e.g. "vignette", "graph". */
  questionType: string | null;
  /** The source's reference, e.g. a slide "S17". */
  sourceRef: string | null;
  /** Image shown with the question. */
  image: MediaRef | null;
  /** Image the source shows once the question is answered (e.g. with labels restored). */
  revealImage: MediaRef | null;
}

export interface McqSet {
  format: "mcq-set";
  title: string | null;
  subtitle: string | null;
  questions: McqQuestion[];
}

export const mcqAnswerSchema: z.ZodType<McqAnswer> = z.discriminatedUnion("status", [
  z.object({ status: z.literal("resolved"), optionIndex: z.number().int().nonnegative() }),
  z.object({ status: z.literal("unresolved"), reason: z.string().min(1) }),
]);

export const mcqQuestionSchema: z.ZodType<McqQuestion> = z
  .object({
    key: z.string().regex(/^q[0-9]+$/),
    number: z.number().int().positive(),
    fingerprint: z.string().regex(/^[0-9a-f]{16}$/),
    stem: inlinesSchema.min(1),
    options: z
      .array(
        z.object({
          label: z.string().regex(/^[A-Z]$/),
          text: inlinesSchema,
          explanation: inlinesSchema.nullable(),
        }),
      )
      .min(2),
    answer: mcqAnswerSchema,
    explanation: inlinesSchema.nullable(),
    topic: z.string().nullable(),
    questionType: z.string().nullable(),
    sourceRef: z.string().nullable(),
    image: mediaRefSchema.nullable(),
    revealImage: mediaRefSchema.nullable(),
  })
  .refine(
    (question) =>
      question.answer.status !== "resolved" ||
      question.answer.optionIndex < question.options.length,
    { message: "The correct answer must be one of the options." },
  );

export const mcqSetSchema: z.ZodType<McqSet> = z.object({
  format: z.literal("mcq-set"),
  title: z.string().nullable(),
  subtitle: z.string().nullable(),
  questions: z.array(mcqQuestionSchema).min(1),
});
