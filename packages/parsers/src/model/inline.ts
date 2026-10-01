import { z } from "zod";

/*
 * Inline content: the text inside a paragraph, list item, table cell or
 * question, as a sequence of runs.
 *
 * Text is stored exactly as the source has it. The only interpretation is
 * structural: emphasis the source marks as emphasis, line breaks, and slide
 * references (" S17") that the source sets apart from the sentence.
 */

export const TEXT_MARKS = ["bold", "italic", "underline", "superscript", "subscript"] as const;
export type TextMark = (typeof TEXT_MARKS)[number];

export const textRunSchema = z.object({
  type: z.literal("text"),
  text: z.string().min(1),
  marks: z.array(z.enum(TEXT_MARKS)).optional(),
});

export const lineBreakSchema = z.object({ type: z.literal("break") });

/**
 * A reference to slides of the original lecture, kept verbatim ("S52–") with
 * the slide numbers it names. Provenance for future Study Guide ↔ slide links.
 */
export const slideRefSchema = z.object({
  type: z.literal("slide-ref"),
  text: z.string().min(1),
  slides: z.array(z.number().int().positive()).min(1),
});

export const inlineSchema = z.discriminatedUnion("type", [
  textRunSchema,
  lineBreakSchema,
  slideRefSchema,
]);

export type TextRun = z.infer<typeof textRunSchema>;
export type SlideRef = z.infer<typeof slideRefSchema>;
export type Inline = z.infer<typeof inlineSchema>;

export const inlinesSchema = z.array(inlineSchema);

/** The plain text of inline content, for search and comparisons. */
export function plainText(inlines: readonly Inline[]): string {
  return inlines
    .map((inline) => {
      switch (inline.type) {
        case "text":
        case "slide-ref":
          return inline.text;
        case "break":
          return "\n";
      }
    })
    .join("");
}

/** Plain text as inline content, without marks. Empty text yields no runs. */
export function textInlines(text: string): Inline[] {
  return text.length > 0 ? [{ type: "text", text }] : [];
}
