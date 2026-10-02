import {
  HEADING_UNIT,
  type ParseIssue,
  type StudyGuideDocument,
  anchorContext,
  isUnitPath,
  studyGuideTextUnits,
  unitText,
  validateContent,
} from "@medos/parsers/model";
import { and, asc, eq, inArray } from "drizzle-orm";

import type { Database } from "../client";
import {
  type AnnotationKind,
  type StudyGuideAnnotation,
  type StudyGuideProgress,
  resources,
  studyGuideAnnotations,
  studyGuideProgress,
} from "../schema";

/*
 * The study guide reader's data: a guide's content, and the user's own layer
 * over it (annotations and reading progress). Every operation is bound to the
 * user of the scope it belongs to, and a guide that is not theirs behaves
 * exactly like one that does not exist.
 *
 * Nothing here writes to parsed content, to originals, or to lecture
 * completion. Reading progress and annotations are separate from completion,
 * which only the user's explicit "Mark lecture complete" changes.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECTION_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const isId = (value: string) => UUID.test(value);

export const MAX_QUOTE_LENGTH = 5000;
export const MAX_NOTE_LENGTH = 10_000;

/** A study guide as the reader needs it. */
export interface StudyGuideView {
  resourceId: string;
  lectureId: string;
  originalFilename: string;
  content: StudyGuideDocument;
  issues: ParseIssue[];
  /** False when the file changed after this content was read from it. */
  current: boolean;
  extractedAt: Date;
}

/**
 * An annotation as the application sees it. The hash of the original it was
 * made against stays in the database.
 */
export type AnnotationView = Pick<
  StudyGuideAnnotation,
  | "id"
  | "resourceId"
  | "kind"
  | "sectionId"
  | "unitPath"
  | "startOffset"
  | "endOffset"
  | "quote"
  | "prefix"
  | "suffix"
  | "note"
  | "createdAt"
  | "updatedAt"
>;

const annotationColumns = {
  id: studyGuideAnnotations.id,
  resourceId: studyGuideAnnotations.resourceId,
  kind: studyGuideAnnotations.kind,
  sectionId: studyGuideAnnotations.sectionId,
  unitPath: studyGuideAnnotations.unitPath,
  startOffset: studyGuideAnnotations.startOffset,
  endOffset: studyGuideAnnotations.endOffset,
  quote: studyGuideAnnotations.quote,
  prefix: studyGuideAnnotations.prefix,
  suffix: studyGuideAnnotations.suffix,
  note: studyGuideAnnotations.note,
  createdAt: studyGuideAnnotations.createdAt,
  updatedAt: studyGuideAnnotations.updatedAt,
};

/** What the browser asks for. Untrusted: checked against the guide's own text. */
export interface AnnotationInput {
  kind: AnnotationKind;
  /** Null for the preamble. */
  sectionId: string | null;
  /** Null to annotate a whole section. */
  unitPath: string | null;
  start: number | null;
  end: number | null;
  /** The passage the user selected, as they saw it. Ignored for a whole section. */
  quote: string | null;
  note?: string | null;
}

export type AnnotationResult =
  | { ok: true; annotation: AnnotationView }
  | { ok: false; reason: "not-found" | "invalid" | "text-mismatch" };

/** Reading progress, measured against the current version of the guide. */
export interface ReadingProgressView {
  furthestSectionId: string | null;
  lastSectionId: string | null;
  sectionsRead: number;
  sectionCount: number;
  /** 0–100. 100 only when the end of the last section was reached. */
  percent: number;
  updatedAt: Date | null;
}

export function percentOf(read: number, count: number): number {
  if (count <= 0) return 0;
  // Floored, so 100% is shown only when the very end was reached.
  return Math.floor((Math.min(read, count) * 100) / count);
}

/** Progress as it stands for this version of the guide (sections can change on re-import). */
export function readingProgressView(
  row: Pick<
    StudyGuideProgress,
    "furthestSectionId" | "furthestPosition" | "sectionCount" | "lastSectionId" | "updatedAt"
  > | null,
  document: StudyGuideDocument,
): ReadingProgressView {
  const sectionCount = document.sections.length;
  if (!row) {
    return {
      furthestSectionId: null,
      lastSectionId: null,
      sectionsRead: 0,
      sectionCount,
      percent: 0,
      updatedAt: null,
    };
  }
  const index = document.sections.findIndex((section) => section.id === row.furthestSectionId);
  // A section that no longer exists keeps the proportion that was reached.
  const sectionsRead =
    index >= 0
      ? index + 1
      : Math.min(
          sectionCount,
          Math.round((row.furthestPosition / row.sectionCount) * sectionCount),
        );
  const lastExists = document.sections.some((section) => section.id === row.lastSectionId);
  return {
    furthestSectionId: index >= 0 ? row.furthestSectionId : null,
    lastSectionId: lastExists ? row.lastSectionId : null,
    sectionsRead,
    sectionCount,
    percent: percentOf(sectionsRead, sectionCount),
    updatedAt: row.updatedAt,
  };
}

export function createStudyGuideAccess(db: Database, userId: string) {
  /** The user's study guide with its parsed content, or null. */
  async function load(resourceId: string) {
    if (!isId(resourceId)) return null;
    const row = await db.query.resources.findFirst({
      where: and(eq(resources.id, resourceId), eq(resources.userId, userId)),
      columns: {
        id: true,
        lectureId: true,
        kind: true,
        originalFilename: true,
        contentHash: true,
      },
      with: {
        content: {
          columns: { content: true, issues: true, sourceContentHash: true, extractedAt: true },
        },
      },
    });
    if (!row || row.kind !== "study-guide" || !row.content) return null;
    const content = validateContent(row.content.content);
    if (content.format !== "study-guide") return null;
    return {
      view: {
        resourceId: row.id,
        lectureId: row.lectureId,
        originalFilename: row.originalFilename,
        content,
        issues: row.content.issues,
        current: row.content.sourceContentHash === row.contentHash,
        extractedAt: row.content.extractedAt,
      } satisfies StudyGuideView,
      sourceContentHash: row.content.sourceContentHash,
    };
  }

  /** Builds the stored anchor from untrusted input, using only the guide's own text. */
  function anchorFor(document: StudyGuideDocument, input: AnnotationInput) {
    const { sectionId, unitPath, start, end } = input;
    if (sectionId !== null && !SECTION_ID.test(sectionId)) return null;
    const units = studyGuideTextUnits(document, sectionId);
    if (!units) return null;

    if (unitPath === null) {
      // A whole section: bookmarks, Review Later and notes only, never the preamble.
      if (sectionId === null || input.kind === "highlight") return null;
      if (start !== null || end !== null) return null;
      const quote = unitText(units.get(HEADING_UNIT) ?? []);
      return quote.length > 0
        ? {
            sectionId,
            unitPath: null,
            startOffset: null,
            endOffset: null,
            quote,
            prefix: "",
            suffix: "",
          }
        : null;
    }

    if (!isUnitPath(unitPath)) return null;
    const unit = units.get(unitPath);
    if (!unit || start === null || end === null) return null;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start)
      return null;
    const text = unitText(unit);
    if (end > text.length || end - start > MAX_QUOTE_LENGTH) return null;
    const quote = text.slice(start, end);
    if (quote.trim().length === 0) return null;
    // The browser's selection must be exactly the source text at those offsets.
    if (input.quote !== quote) return "text-mismatch" as const;
    return {
      sectionId,
      unitPath,
      startOffset: start,
      endOffset: end,
      quote,
      ...anchorContext(text, start, end),
    };
  }

  function cleanNote(kind: AnnotationKind, note: string | null | undefined) {
    if (kind !== "note") return note === null || note === undefined ? null : undefined;
    const trimmed = note?.trim() ?? "";
    return trimmed.length > 0 && trimmed.length <= MAX_NOTE_LENGTH ? trimmed : undefined;
  }

  /** The user's annotations on one of their guides, in the order they were made. */
  async function listAnnotations(resourceId: string): Promise<AnnotationView[]> {
    if (!isId(resourceId)) return [];
    return db
      .select(annotationColumns)
      .from(studyGuideAnnotations)
      .where(
        and(
          eq(studyGuideAnnotations.resourceId, resourceId),
          eq(studyGuideAnnotations.userId, userId),
        ),
      )
      .orderBy(asc(studyGuideAnnotations.createdAt), asc(studyGuideAnnotations.id));
  }

  return {
    get: async (resourceId: string): Promise<StudyGuideView | null> =>
      (await load(resourceId))?.view ?? null,

    annotations: {
      list: listAnnotations,

      /**
       * Records a highlight, note, bookmark or Review Later item. The passage
       * is checked against the guide's current text; asking for the same
       * highlight, bookmark or Review Later item twice returns the first.
       */
      async create(resourceId: string, input: AnnotationInput): Promise<AnnotationResult> {
        const guide = await load(resourceId);
        if (!guide) return { ok: false, reason: "not-found" };

        const anchor = anchorFor(guide.view.content, input);
        if (anchor === "text-mismatch") return { ok: false, reason: "text-mismatch" };
        const note = cleanNote(input.kind, input.note);
        if (!anchor || note === undefined) return { ok: false, reason: "invalid" };

        const values = {
          userId,
          resourceId,
          kind: input.kind,
          ...anchor,
          note,
          sourceContentHash: guide.sourceContentHash,
        };
        const [created] = await db
          .insert(studyGuideAnnotations)
          .values(values)
          .onConflictDoNothing()
          .returning(annotationColumns);
        if (created) return { ok: true, annotation: created };

        // Already there: the same kind on the same place.
        const all = await listAnnotations(resourceId);
        const existing = all.find(
          (row) =>
            row.kind === values.kind &&
            row.sectionId === values.sectionId &&
            row.unitPath === values.unitPath &&
            row.startOffset === values.startOffset &&
            row.endOffset === values.endOffset,
        );
        return existing ? { ok: true, annotation: existing } : { ok: false, reason: "invalid" };
      },

      /** Changes the words of one of the user's notes. */
      async updateNote(annotationId: string, note: string): Promise<AnnotationView | null> {
        if (!isId(annotationId)) return null;
        const cleaned = cleanNote("note", note);
        if (!cleaned) return null;
        const [updated] = await db
          .update(studyGuideAnnotations)
          .set({ note: cleaned })
          .where(
            and(
              eq(studyGuideAnnotations.id, annotationId),
              eq(studyGuideAnnotations.userId, userId),
              eq(studyGuideAnnotations.kind, "note"),
            ),
          )
          .returning(annotationColumns);
        return updated ?? null;
      },

      /** Removes one of the user's annotations. The source is untouched. */
      async remove(annotationId: string): Promise<boolean> {
        if (!isId(annotationId)) return false;
        const removed = await db
          .delete(studyGuideAnnotations)
          .where(
            and(
              eq(studyGuideAnnotations.id, annotationId),
              eq(studyGuideAnnotations.userId, userId),
            ),
          )
          .returning({ id: studyGuideAnnotations.id });
        return removed.length > 0;
      },
    },

    progress: {
      async get(resourceId: string): Promise<ReadingProgressView | null> {
        const guide = await load(resourceId);
        if (!guide) return null;
        const [row] = await db
          .select()
          .from(studyGuideProgress)
          .where(
            and(
              eq(studyGuideProgress.resourceId, resourceId),
              eq(studyGuideProgress.userId, userId),
            ),
          );
        return readingProgressView(row ?? null, guide.view.content);
      },

      /**
       * Records that the user reached the end of a section. Progress only
       * moves forward; the last section reached is kept for resuming. This
       * never changes lecture completion.
       */
      async record(resourceId: string, sectionId: string): Promise<ReadingProgressView | null> {
        const guide = await load(resourceId);
        if (!guide || !SECTION_ID.test(sectionId)) return null;
        const sections = guide.view.content.sections;
        const index = sections.findIndex((section) => section.id === sectionId);
        if (index < 0) return null;

        const [existing] = await db
          .select()
          .from(studyGuideProgress)
          .where(
            and(
              eq(studyGuideProgress.resourceId, resourceId),
              eq(studyGuideProgress.userId, userId),
            ),
          );
        const before = readingProgressView(existing ?? null, guide.view.content);
        const position = Math.max(before.sectionsRead, index + 1);

        const values = {
          furthestSectionId: sections[position - 1]?.id ?? sectionId,
          furthestPosition: position,
          sectionCount: sections.length,
          lastSectionId: sectionId,
        };
        const [row] = await db
          .insert(studyGuideProgress)
          .values({ userId, resourceId, ...values })
          .onConflictDoUpdate({
            target: studyGuideProgress.resourceId,
            set: values,
            setWhere: eq(studyGuideProgress.userId, userId),
          })
          .returning();
        return row ? readingProgressView(row, guide.view.content) : null;
      },

      /** Reading progress of a lecture's guides, by resource id, for the lecture page. */
      async forLecture(lectureId: string): Promise<Map<string, number>> {
        if (!isId(lectureId)) return new Map();
        const guides = await db
          .select({ id: resources.id })
          .from(resources)
          .where(
            and(
              eq(resources.lectureId, lectureId),
              eq(resources.userId, userId),
              eq(resources.kind, "study-guide"),
            ),
          );
        if (guides.length === 0) return new Map();
        const rows = await db
          .select()
          .from(studyGuideProgress)
          .where(
            and(
              eq(studyGuideProgress.userId, userId),
              inArray(
                studyGuideProgress.resourceId,
                guides.map((guide) => guide.id),
              ),
            ),
          );
        return new Map(
          rows.map((row) => [row.resourceId, percentOf(row.furthestPosition, row.sectionCount)]),
        );
      },
    },
  };
}
