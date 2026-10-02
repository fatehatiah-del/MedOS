// @vitest-environment node
import {
  type Database,
  type DatabaseConnection,
  courses,
  createUserScope,
  lectureProgress,
  lectures,
  resourceContents,
  resources,
  semesters,
  users,
  weeks,
} from "@medos/database";
import { createTestDatabase } from "@medos/database/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  MESSAGES,
  createPageAnnotation,
  recordViewerPosition,
  removePageAnnotation,
  updatePageNote,
} from "./annotations";

/* The viewer's actions as the browser calls them: untrusted input, the user's scope. */

let connection: DatabaseConnection;
let db: Database;

async function only<T>(rows: Promise<T[]>): Promise<T> {
  const [row] = await rows;
  if (row === undefined) throw new Error("expected a row");
  return row;
}

let sequence = 0;

async function createOwner() {
  sequence += 1;
  const user = await only(
    db
      .insert(users)
      .values({ email: `viewer-${sequence}@example.test`, displayName: "Viewer" })
      .returning(),
  );
  const owned = { userId: user.id };
  const semester = await only(
    db
      .insert(semesters)
      .values({
        ...owned,
        slug: "2026-fall",
        name: "Fall 2026",
        label: "Semester 5",
        startsOn: "2026-09-28",
        endsOn: "2027-01-29",
      })
      .returning(),
  );
  const course = await only(
    db
      .insert(courses)
      .values({
        ...owned,
        semesterId: semester.id,
        slug: "pharmacology",
        name: "Pharmacology I",
        shortName: "Pharmacology",
      })
      .returning(),
  );
  const week = await only(
    db
      .insert(weeks)
      .values({ ...owned, courseId: course.id, number: 1 })
      .returning(),
  );
  const lecture = await only(
    db
      .insert(lectures)
      .values({ ...owned, courseId: course.id, weekId: week.id, number: 1, title: "Lecture 1" })
      .returning(),
  );
  const hash = String(sequence).repeat(64).slice(0, 64);
  const pdf = await only(
    db
      .insert(resources)
      .values({
        ...owned,
        lectureId: lecture.id,
        kind: "original-lecture",
        originalFilename: "Lecture.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1,
        contentHash: hash,
        storageKey: `sha256/${hash}`,
        status: "parsed",
      })
      .returning(),
  );
  await db.insert(resourceContents).values({
    ...owned,
    resourceId: pdf.id,
    format: "pdf",
    parser: "pdf-registration",
    parserVersion: 1,
    sourceContentHash: hash,
    content: {
      format: "pdf",
      pageCount: 5,
      metadata: { title: null, author: null, creator: null, producer: null, createdAt: null },
      pages: [1, 2, 3, 4, 5].map((number) => ({ number, text: `Page ${number}` })),
    },
    extractedAt: new Date(),
  });
  return { user, lecture, pdf, scope: createUserScope(db, user.id) };
}

let a: Awaited<ReturnType<typeof createOwner>>;
let b: Awaited<ReturnType<typeof createOwner>>;

beforeAll(async () => {
  connection = await createTestDatabase();
  db = connection.db;
  a = await createOwner();
  b = await createOwner();
});

afterAll(async () => {
  await connection.close();
});

describe("viewer actions", () => {
  it("mark a page for the signed-in user, ignoring any user id sent", async () => {
    const result = await createPageAnnotation(a.scope, {
      resourceId: a.pdf.id,
      kind: "bookmark",
      page: 3,
      userId: b.user.id,
    });
    expect(result.ok).toBe(true);
    expect(await a.scope.originalLectures.annotations.list(a.pdf.id)).toHaveLength(1);
    expect(await b.scope.originalLectures.annotations.list(a.pdf.id)).toHaveLength(0);
  });

  it("refuse malformed input and pages outside the PDF", async () => {
    for (const input of [
      null,
      { resourceId: "x", kind: "bookmark", page: 1 },
      { resourceId: a.pdf.id, kind: "highlight", page: 1 },
      { resourceId: a.pdf.id, kind: "bookmark", page: 0 },
      { resourceId: a.pdf.id, kind: "bookmark", page: 6 },
      { resourceId: a.pdf.id, kind: "bookmark", page: "2" },
    ]) {
      expect(await createPageAnnotation(a.scope, input)).toEqual({
        ok: false,
        error: MESSAGES.invalid,
      });
    }
    expect(
      await createPageAnnotation(a.scope, {
        resourceId: a.pdf.id,
        kind: "note",
        page: 1,
        note: " ",
      }),
    ).toEqual({ ok: false, error: MESSAGES.emptyNote });
    expect(
      await createPageAnnotation(b.scope, { resourceId: a.pdf.id, kind: "bookmark", page: 1 }),
    ).toEqual({ ok: false, error: MESSAGES.notFound });
  });

  it("save, edit and remove notes, for their owner only", async () => {
    const created = await createPageAnnotation(a.scope, {
      resourceId: a.pdf.id,
      kind: "note",
      page: 2,
      note: "Mine",
    });
    if (!created.ok) throw new Error(created.error);
    const id = created.value.id;
    expect(await updatePageNote(b.scope, { annotationId: id, note: "x" })).toEqual({
      ok: false,
      error: MESSAGES.annotationMissing,
    });
    expect(await removePageAnnotation(b.scope, { annotationId: id })).toEqual({
      ok: false,
      error: MESSAGES.annotationMissing,
    });
    expect((await updatePageNote(a.scope, { annotationId: id, note: "Edited" })).ok).toBe(true);
    expect((await removePageAnnotation(a.scope, { annotationId: id })).ok).toBe(true);
  });

  it("remember the page without completing the lecture", async () => {
    expect(await recordViewerPosition(a.scope, { resourceId: a.pdf.id, page: 5 })).toEqual({
      ok: true,
      value: { page: 5 },
    });
    expect(await recordViewerPosition(b.scope, { resourceId: a.pdf.id, page: 5 })).toEqual({
      ok: false,
      error: MESSAGES.notFound,
    });
    const rows = await db
      .select()
      .from(lectureProgress)
      .where(eq(lectureProgress.lectureId, a.lecture.id));
    expect(rows.every((row) => row.completedAt === null)).toBe(true);
  });
});
