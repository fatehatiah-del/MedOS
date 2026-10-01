import { z } from "zod";

import { type Block, blockSchema } from "./blocks";
import { type Inline, inlinesSchema } from "./inline";

/**
 * The model answer of a Question Bank item. It is "paired" only when the
 * source unambiguously connects an answer to the question (the same number in
 * an answers section, or an "A:" directly after its "Q:"). Otherwise it is
 * missing or ambiguous, with the reason; MedOS never writes or guesses one.
 */
export type QuestionBankAnswer =
  | {
      status: "paired";
      blocks: Block[];
      /** The choice the answer names as correct ("B"), when the item has choices. */
      correctLabel: string | null;
      /** The source's notes on why particular choices are wrong. */
      choiceNotes: { label: string; text: Inline[] }[];
    }
  | { status: "missing"; reason: string }
  | { status: "ambiguous"; reason: string };

export interface QuestionBankItem {
  /** Stable within the bank: "q" + position in the source. */
  key: string;
  /** The number the source gives the question, if any. */
  number: number | null;
  /** SHA-256 prefix of the question's text, to recognise it after a re-import. */
  fingerprint: string;
  /** The question, with any images that belong to it. */
  prompt: Block[];
  /** Answer choices, when the source lists them under the question. */
  choices: { label: string; text: Inline[] }[];
  answer: QuestionBankAnswer;
}

export interface QuestionBank {
  format: "question-bank";
  title: string | null;
  items: QuestionBankItem[];
}

export const questionBankAnswerSchema: z.ZodType<QuestionBankAnswer> = z.discriminatedUnion(
  "status",
  [
    z.object({
      status: z.literal("paired"),
      blocks: z.array(blockSchema).min(1),
      correctLabel: z
        .string()
        .regex(/^[A-Z]$/)
        .nullable(),
      choiceNotes: z.array(z.object({ label: z.string().regex(/^[A-Z]$/), text: inlinesSchema })),
    }),
    z.object({ status: z.literal("missing"), reason: z.string().min(1) }),
    z.object({ status: z.literal("ambiguous"), reason: z.string().min(1) }),
  ],
);

export const questionBankItemSchema: z.ZodType<QuestionBankItem> = z.object({
  key: z.string().regex(/^q[0-9]+$/),
  number: z.number().int().positive().nullable(),
  fingerprint: z.string().regex(/^[0-9a-f]{16}$/),
  prompt: z.array(blockSchema).min(1),
  choices: z.array(z.object({ label: z.string().regex(/^[A-Z]$/), text: inlinesSchema })),
  answer: questionBankAnswerSchema,
});

export const questionBankSchema: z.ZodType<QuestionBank> = z.object({
  format: z.literal("question-bank"),
  title: z.string().nullable(),
  items: z.array(questionBankItemSchema).min(1),
});
