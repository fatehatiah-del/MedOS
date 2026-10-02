import type { AnnotationKind, AnnotationView } from "@medos/database";
import { type StudyGuideDocument, resolveAnchor } from "@medos/parsers/model";

import type { MarkRange } from "./segments";
import { headingLabel } from "./structure";

/*
 * The reader's view of the user's annotations: each one resolved against the
 * guide as it is now, with where it points and how it is labelled. Computed
 * on the server; only plain data reaches the browser.
 */

/** Identifies a text unit across the whole guide: its section (empty for the preamble) and path. */
export const unitKey = (sectionId: string | null, unitPath: string) =>
  `${sectionId ?? ""}|${unitPath}`;

export const PREAMBLE_LABEL = "Before the first heading";

export interface ReaderAnnotation {
  id: string;
  kind: AnnotationKind;
  note: string | null;
  /** The passage (or section heading) as the source has it. */
  quote: string;
  /** `text`: a passage; `section`: a whole section; `orphaned`: its text is no longer in the guide. */
  status: "text" | "section" | "orphaned";
  sectionId: string | null;
  /** The heading of the section it is in, for the panel. */
  sectionLabel: string | null;
  unitPath: string | null;
  createdAt: string;
}

export interface ReaderAnnotations {
  list: ReaderAnnotation[];
  /** Marked ranges per text unit (`unitKey`). */
  marks: Map<string, MarkRange[]>;
}

export function buildReaderAnnotations(
  document: StudyGuideDocument,
  annotations: readonly AnnotationView[],
): ReaderAnnotations {
  const labels = new Map(
    document.sections.map((section) => [section.id, headingLabel(section.heading)]),
  );
  const marks = new Map<string, MarkRange[]>();
  const list = annotations.map((annotation): ReaderAnnotation => {
    const resolved = resolveAnchor(document, {
      sectionId: annotation.sectionId,
      unitPath: annotation.unitPath,
      start: annotation.startOffset,
      end: annotation.endOffset,
      quote: annotation.quote,
      prefix: annotation.prefix,
      suffix: annotation.suffix,
    });
    const base = {
      id: annotation.id,
      kind: annotation.kind,
      note: annotation.note,
      quote: annotation.quote,
      createdAt: annotation.createdAt.toISOString(),
    };
    if (resolved.status === "orphaned") {
      return {
        ...base,
        status: "orphaned",
        sectionId: null,
        sectionLabel: null,
        unitPath: null,
      };
    }
    const sectionLabel =
      resolved.sectionId === null ? PREAMBLE_LABEL : (labels.get(resolved.sectionId) ?? null);
    if (resolved.status === "section") {
      return {
        ...base,
        status: "section",
        sectionId: resolved.sectionId,
        sectionLabel,
        unitPath: null,
      };
    }
    const key = unitKey(resolved.sectionId, resolved.unitPath);
    const ranges = marks.get(key) ?? [];
    ranges.push({
      id: annotation.id,
      kind: annotation.kind,
      start: resolved.start,
      end: resolved.end,
    });
    marks.set(key, ranges);
    return {
      ...base,
      status: "text",
      sectionId: resolved.sectionId,
      sectionLabel,
      unitPath: resolved.unitPath,
    };
  });
  return { list, marks };
}
