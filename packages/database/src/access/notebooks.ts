import { and, desc, eq, sql } from "drizzle-orm";

import type { Database } from "../client";
import { MAX_NOTEBOOK_BYTES, MAX_NOTEBOOK_TEXT } from "../limits";
import { type NotebookDocument, courses, lectureNotebooks, lectures, weeks } from "../schema";

/*
 * Lecture notebooks: the user's own rich-text notes, one document per
 * lecture. Every operation is bound to the scope's user; a lecture that is
 * not theirs behaves exactly like one that does not exist.
 *
 * Saves are guarded by revision: the browser says which revision it edited,
 * and a save against anything else is refused with the current document, so
 * a second tab never silently overwrites the first. Nothing here touches the
 * Study Guide's parsed content or lecture completion.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (value: string) => UUID.test(value);

export const EMPTY_NOTEBOOK: NotebookDocument = { type: "doc", content: [] };

/** A lecture's notebook. Revision 0 and no `updatedAt` mean nothing has been saved yet. */
export interface NotebookView {
  lectureId: string;
  content: NotebookDocument;
  revision: number;
  updatedAt: Date | null;
}

/** A notebook as the notebooks overview lists it. */
export interface NotebookListing {
  lectureId: string;
  lectureNumber: number;
  lectureTitle: string;
  weekNumber: number;
  course: { slug: string; name: string; shortName: string; colorToken: string | null };
  excerpt: string;
  characterCount: number;
  updatedAt: Date;
}

export interface NotebookSave {
  content: NotebookDocument;
  plainText: string;
  /** The revision the browser's copy was based on; 0 when nothing had been saved. */
  baseRevision: number;
}

export type NotebookSaveResult =
  | { status: "saved"; revision: number; updatedAt: Date }
  | { status: "conflict"; current: NotebookView }
  | { status: "not-found" }
  | { status: "invalid"; message: string };

function isDocument(value: unknown): value is NotebookDocument {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { type?: unknown }).type === "doc" &&
    ((value as { content?: unknown }).content === undefined ||
      Array.isArray((value as { content?: unknown }).content))
  );
}

export function createNotebookAccess(db: Database, userId: string) {
  async function ownsLecture(lectureId: string): Promise<boolean> {
    if (!isId(lectureId)) return false;
    const [row] = await db
      .select({ id: lectures.id })
      .from(lectures)
      .where(and(eq(lectures.id, lectureId), eq(lectures.userId, userId)));
    return Boolean(row);
  }

  async function read(lectureId: string): Promise<NotebookView> {
    const [row] = await db
      .select()
      .from(lectureNotebooks)
      .where(and(eq(lectureNotebooks.lectureId, lectureId), eq(lectureNotebooks.userId, userId)));
    return row
      ? { lectureId, content: row.content, revision: row.revision, updatedAt: row.updatedAt }
      : { lectureId, content: EMPTY_NOTEBOOK, revision: 0, updatedAt: null };
  }

  return {
    /** The lecture's notebook (empty if never saved), or null if the lecture is not the user's. */
    async get(lectureId: string): Promise<NotebookView | null> {
      if (!(await ownsLecture(lectureId))) return null;
      return read(lectureId);
    },

    async save(lectureId: string, input: NotebookSave): Promise<NotebookSaveResult> {
      if (!isDocument(input.content)) {
        return { status: "invalid", message: "The notebook could not be read." };
      }
      if (!Number.isInteger(input.baseRevision) || input.baseRevision < 0) {
        return { status: "invalid", message: "The notebook could not be read." };
      }
      if (typeof input.plainText !== "string" || input.plainText.length > MAX_NOTEBOOK_TEXT) {
        return { status: "invalid", message: "This notebook is too long to save." };
      }
      if (new TextEncoder().encode(JSON.stringify(input.content)).length > MAX_NOTEBOOK_BYTES) {
        return { status: "invalid", message: "This notebook is too long to save." };
      }
      if (!(await ownsLecture(lectureId))) return { status: "not-found" };

      const values = { content: input.content, plainText: input.plainText };
      const [row] =
        input.baseRevision === 0
          ? await db
              .insert(lectureNotebooks)
              .values({ userId, lectureId, ...values, revision: 1 })
              .onConflictDoNothing({ target: lectureNotebooks.lectureId })
              .returning({
                revision: lectureNotebooks.revision,
                updatedAt: lectureNotebooks.updatedAt,
              })
          : await db
              .update(lectureNotebooks)
              .set({ ...values, revision: sql`${lectureNotebooks.revision} + 1` })
              .where(
                and(
                  eq(lectureNotebooks.lectureId, lectureId),
                  eq(lectureNotebooks.userId, userId),
                  eq(lectureNotebooks.revision, input.baseRevision),
                ),
              )
              .returning({
                revision: lectureNotebooks.revision,
                updatedAt: lectureNotebooks.updatedAt,
              });
      if (row) return { status: "saved", revision: row.revision, updatedAt: row.updatedAt };
      return { status: "conflict", current: await read(lectureId) };
    },

    /** Every notebook with something in it, most recently edited first. */
    async list(): Promise<NotebookListing[]> {
      const rows = await db
        .select({
          lectureId: lectures.id,
          lectureNumber: lectures.number,
          lectureTitle: lectures.title,
          weekNumber: weeks.number,
          slug: courses.slug,
          name: courses.name,
          shortName: courses.shortName,
          colorToken: courses.colorToken,
          excerpt: sql<string>`left(${lectureNotebooks.plainText}, 240)`,
          characterCount: sql<number>`char_length(${lectureNotebooks.plainText})::int`,
          updatedAt: lectureNotebooks.updatedAt,
        })
        .from(lectureNotebooks)
        .innerJoin(
          lectures,
          and(eq(lectures.id, lectureNotebooks.lectureId), eq(lectures.userId, userId)),
        )
        .innerJoin(weeks, eq(weeks.id, lectures.weekId))
        .innerJoin(courses, eq(courses.id, lectures.courseId))
        .where(eq(lectureNotebooks.userId, userId))
        .orderBy(desc(lectureNotebooks.updatedAt));
      return rows
        .filter((row) => row.characterCount > 0)
        .map(({ slug, name, shortName, colorToken, ...row }) => ({
          ...row,
          course: { slug, name, shortName, colorToken },
        }));
    },
  };
}
