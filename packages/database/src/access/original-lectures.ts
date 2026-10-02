import { type PdfDocument, validateContent } from "@medos/parsers/model";
import { and, asc, eq } from "drizzle-orm";

import type { Database } from "../client";
import {
  type OriginalLectureAnnotation,
  type PageAnnotationKind,
  originalLectureAnnotations,
  originalLecturePositions,
  resources,
} from "../schema";

/*
 * The original lecture viewer's data: a lecture PDF's registration, where its
 * stored file is (for the server only), and the user's own layer over it
 * (page bookmarks, notes, Review Later, the last page they were on).
 *
 * Every operation is bound to the scope's user; a PDF that is not theirs
 * behaves exactly like one that does not exist. Nothing here changes the
 * original, its parsed content, or lecture completion.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (value: string) => UUID.test(value);

const MAX_PAGE_NOTE_LENGTH = 10_000;

/** An original lecture PDF as the viewer needs it. */
export interface OriginalLectureView {
  resourceId: string;
  lectureId: string;
  originalFilename: string;
  sizeBytes: number;
  pageCount: number;
  metadata: PdfDocument["metadata"];
  /** Pages with no extractable text (scanned or image-only). */
  pagesWithoutText: number[];
  /** False when the file changed after it was registered. */
  current: boolean;
}

/** Where an original file is stored. Server-side only; never sent to the browser. */
export interface StoredOriginal {
  contentHash: string;
  storageKey: string;
  mimeType: string;
  originalFilename: string;
  sizeBytes: number;
}

export type PageAnnotationView = Pick<
  OriginalLectureAnnotation,
  "id" | "resourceId" | "kind" | "page" | "note" | "createdAt" | "updatedAt"
>;

const annotationColumns = {
  id: originalLectureAnnotations.id,
  resourceId: originalLectureAnnotations.resourceId,
  kind: originalLectureAnnotations.kind,
  page: originalLectureAnnotations.page,
  note: originalLectureAnnotations.note,
  createdAt: originalLectureAnnotations.createdAt,
  updatedAt: originalLectureAnnotations.updatedAt,
};

export interface PageAnnotationInput {
  kind: PageAnnotationKind;
  page: number;
  note?: string | null;
}

export type PageAnnotationResult =
  { ok: true; annotation: PageAnnotationView } | { ok: false; reason: "not-found" | "invalid" };

export function createOriginalLectureAccess(db: Database, userId: string) {
  /** The user's readable original lecture PDF, with its registration, or null. */
  async function load(resourceId: string) {
    if (!isId(resourceId)) return null;
    const row = await db.query.resources.findFirst({
      where: and(eq(resources.id, resourceId), eq(resources.userId, userId)),
      columns: {
        id: true,
        lectureId: true,
        kind: true,
        originalFilename: true,
        mimeType: true,
        sizeBytes: true,
        contentHash: true,
        storageKey: true,
      },
      with: { content: { columns: { content: true, sourceContentHash: true } } },
    });
    if (!row || row.kind !== "original-lecture" || !row.content || !row.storageKey) return null;
    const content = validateContent(row.content.content);
    if (content.format !== "pdf") return null;
    return { row, content };
  }

  async function listAnnotations(resourceId: string): Promise<PageAnnotationView[]> {
    if (!isId(resourceId)) return [];
    return db
      .select(annotationColumns)
      .from(originalLectureAnnotations)
      .where(
        and(
          eq(originalLectureAnnotations.resourceId, resourceId),
          eq(originalLectureAnnotations.userId, userId),
        ),
      )
      .orderBy(asc(originalLectureAnnotations.page), asc(originalLectureAnnotations.createdAt));
  }

  function cleanNote(kind: PageAnnotationKind, note: string | null | undefined) {
    if (kind !== "note") return note === null || note === undefined ? null : undefined;
    const trimmed = note?.trim() ?? "";
    return trimmed.length > 0 && trimmed.length <= MAX_PAGE_NOTE_LENGTH ? trimmed : undefined;
  }

  return {
    async get(resourceId: string): Promise<OriginalLectureView | null> {
      const found = await load(resourceId);
      if (!found) return null;
      const { row, content } = found;
      return {
        resourceId: row.id,
        lectureId: row.lectureId,
        originalFilename: row.originalFilename,
        sizeBytes: row.sizeBytes,
        pageCount: content.pageCount,
        metadata: content.metadata,
        pagesWithoutText: content.pages
          .filter((page) => page.text.trim().length === 0)
          .map((page) => page.number),
        current: row.content?.sourceContentHash === row.contentHash,
      };
    },

    /**
     * Where the stored original of a readable lecture PDF is. Null unless it
     * is the user's original lecture PDF. For the server only.
     */
    async file(resourceId: string): Promise<StoredOriginal | null> {
      const found = await load(resourceId);
      const storageKey = found?.row.storageKey;
      if (!found || !storageKey) return null;
      const { row } = found;
      return {
        contentHash: row.contentHash,
        storageKey,
        mimeType: row.mimeType,
        originalFilename: row.originalFilename,
        sizeBytes: row.sizeBytes,
      };
    },

    annotations: {
      list: listAnnotations,

      /**
       * Records a bookmark, note or Review Later item on a page that exists in
       * the PDF. Asking for the same bookmark or Review Later item twice
       * returns the first.
       */
      async create(resourceId: string, input: PageAnnotationInput): Promise<PageAnnotationResult> {
        const found = await load(resourceId);
        if (!found) return { ok: false, reason: "not-found" };
        const { page, kind } = input;
        if (!Number.isInteger(page) || page < 1 || page > found.content.pageCount) {
          return { ok: false, reason: "invalid" };
        }
        const note = cleanNote(kind, input.note);
        if (note === undefined) return { ok: false, reason: "invalid" };

        const [created] = await db
          .insert(originalLectureAnnotations)
          .values({
            userId,
            resourceId,
            kind,
            page,
            note,
            sourceContentHash: found.row.contentHash,
          })
          .onConflictDoNothing()
          .returning(annotationColumns);
        if (created) return { ok: true, annotation: created };
        const existing = (await listAnnotations(resourceId)).find(
          (row) => row.kind === kind && row.page === page,
        );
        return existing ? { ok: true, annotation: existing } : { ok: false, reason: "invalid" };
      },

      async updateNote(annotationId: string, note: string): Promise<PageAnnotationView | null> {
        if (!isId(annotationId)) return null;
        const cleaned = cleanNote("note", note);
        if (!cleaned) return null;
        const [updated] = await db
          .update(originalLectureAnnotations)
          .set({ note: cleaned })
          .where(
            and(
              eq(originalLectureAnnotations.id, annotationId),
              eq(originalLectureAnnotations.userId, userId),
              eq(originalLectureAnnotations.kind, "note"),
            ),
          )
          .returning(annotationColumns);
        return updated ?? null;
      },

      async remove(annotationId: string): Promise<boolean> {
        if (!isId(annotationId)) return false;
        const removed = await db
          .delete(originalLectureAnnotations)
          .where(
            and(
              eq(originalLectureAnnotations.id, annotationId),
              eq(originalLectureAnnotations.userId, userId),
            ),
          )
          .returning({ id: originalLectureAnnotations.id });
        return removed.length > 0;
      },
    },

    position: {
      /** The page to resume at, if it still exists in the PDF. */
      async get(resourceId: string): Promise<number | null> {
        const found = await load(resourceId);
        if (!found) return null;
        const [row] = await db
          .select({ page: originalLecturePositions.page })
          .from(originalLecturePositions)
          .where(
            and(
              eq(originalLecturePositions.resourceId, resourceId),
              eq(originalLecturePositions.userId, userId),
            ),
          );
        return row && row.page <= found.content.pageCount ? row.page : null;
      },

      /** Remembers the page the user is on. Never changes lecture completion. */
      async record(resourceId: string, page: number): Promise<number | null> {
        const found = await load(resourceId);
        if (!found || !Number.isInteger(page) || page < 1 || page > found.content.pageCount) {
          return null;
        }
        const [row] = await db
          .insert(originalLecturePositions)
          .values({ userId, resourceId, page })
          .onConflictDoUpdate({
            target: originalLecturePositions.resourceId,
            set: { page },
            setWhere: eq(originalLecturePositions.userId, userId),
          })
          .returning({ page: originalLecturePositions.page });
        return row?.page ?? null;
      },
    },
  };
}
