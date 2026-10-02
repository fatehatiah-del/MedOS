import type { AnnotationKind } from "@medos/database";
import type { Inline, TextMark } from "@medos/parsers/model";

/*
 * Splitting a text unit's inline content where the user's highlights, notes
 * and other marks begin and end, without changing a single character. The
 * pieces, joined, are exactly the source text; only the wrapping differs.
 */

/** A stretch of a text unit the user has marked, in unit-text offsets. */
export interface MarkRange {
  id: string;
  kind: AnnotationKind;
  start: number;
  end: number;
}

/** A piece of text with its source formatting and the user's marks over it. */
export interface TextPiece {
  type: "text";
  text: string;
  marks: readonly TextMark[];
  annotations: readonly MarkRange[];
}

export interface BreakPiece {
  type: "break";
  annotations: readonly MarkRange[];
}

/** A slide reference ("S17"), kept whole, possibly split into marked pieces. */
export interface SlideRefPiece {
  type: "slide-ref";
  slides: readonly number[];
  text: string;
  pieces: TextPiece[];
}

export type Piece = TextPiece | BreakPiece | SlideRefPiece;

const covering = (ranges: readonly MarkRange[], start: number, end: number) =>
  ranges.filter((range) => range.start <= start && range.end >= end);

/** Splits `text` (starting at `offset`) at every range boundary inside it. */
function splitText(
  text: string,
  offset: number,
  marks: readonly TextMark[],
  ranges: readonly MarkRange[],
): TextPiece[] {
  const end = offset + text.length;
  const cuts = new Set<number>([offset, end]);
  for (const range of ranges) {
    if (range.start > offset && range.start < end) cuts.add(range.start);
    if (range.end > offset && range.end < end) cuts.add(range.end);
  }
  const points = [...cuts].sort((a, b) => a - b);
  const pieces: TextPiece[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index] as number;
    const to = points[index + 1] as number;
    pieces.push({
      type: "text",
      text: text.slice(from - offset, to - offset),
      marks,
      annotations: covering(ranges, from, to),
    });
  }
  return pieces;
}

/**
 * The pieces of a unit's inline content. Offsets count text and slide
 * references as written and each line break as one character, matching
 * `unitText` in the content model.
 */
export function segmentInlines(inlines: readonly Inline[], ranges: readonly MarkRange[]): Piece[] {
  const valid = ranges.filter((range) => range.end > range.start);
  const pieces: Piece[] = [];
  let offset = 0;
  for (const inline of inlines) {
    switch (inline.type) {
      case "text":
        pieces.push(...splitText(inline.text, offset, inline.marks ?? [], valid));
        offset += inline.text.length;
        break;
      case "break":
        pieces.push({ type: "break", annotations: covering(valid, offset, offset + 1) });
        offset += 1;
        break;
      case "slide-ref":
        pieces.push({
          type: "slide-ref",
          slides: inline.slides,
          text: inline.text,
          pieces: splitText(inline.text, offset, [], valid),
        });
        offset += inline.text.length;
        break;
    }
  }
  return pieces;
}

/** "slide 17", "slides 52–55", "slides 17 and 18": how a slide reference is read aloud. */
export function slideLabel(slides: readonly number[]): string {
  if (slides.length === 1) return `slide ${slides[0]}`;
  const sorted = [...slides].sort((a, b) => a - b);
  const contiguous = sorted.every(
    (slide, index) => index === 0 || slide === sorted[index - 1]! + 1,
  );
  if (contiguous) return `slides ${sorted[0]}–${sorted[sorted.length - 1]}`;
  return `slides ${sorted.slice(0, -1).join(", ")} and ${sorted[sorted.length - 1]}`;
}
