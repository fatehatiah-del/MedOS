import type { PdfDocument } from "@medos/parsers/model";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database, DatabaseConnection } from "../client";
import {
  lectureProgress,
  originalLectureAnnotations,
  resourceContents,
  resources,
} from "../schema";
import {
  createCourseForNewUser,
  createLecture,
  createWeek,
  first,
  violation,
} from "../test-support";
import { createTestDatabase } from "../testing";

import { createUserScope } from "./user-scope";

/*
 * The original lecture viewer's data at the trusted boundary: a lecture PDF,
 * its stored file and the user's page annotations and position are private,
 * checked against the PDF's pages, and never touch completion.
 */

let connection: DatabaseConnection;
let db: Database;

const pdf: PdfDocument = {
  format: "pdf",
  pageCount: 3,
  metadata: { title: "Slides", author: null, creator: null, producer: null, createdAt: null },
  pages: [
    { number: 1, text: "Synthetic title" },
    { number: 2, text: "" },
    { number: 3, text: "Synthetic end" },
  ],
};

let sequence = 0;

async function createOwner() {
  sequence += 1;
  const { user, course } = await createCourseForNewUser(db);
  const week = await createWeek(db, course, 1);
  const lecture = await createLecture(db, week, 1);
  const hash = String(sequence).repeat(64).slice(0, 64);
  const lecturePdf = first(
    await db
      .insert(resources)
      .values({
        userId: user.id,
        lectureId: lecture.id,
        kind: "original-lecture",
        originalFilename: "Lecture.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1000,
        contentHash: hash,
        storageKey: `sha256/${hash}`,
        status: "parsed",
      })
      .returning(),
  );
  await db.insert(resourceContents).values({
    userId: user.id,
    resourceId: lecturePdf.id,
    format: "pdf",
    parser: "pdf-registration",
    parserVersion: 1,
    sourceContentHash: hash,
    content: pdf,
    extractedAt: new Date(),
  });
  // A Study Guide of the same lecture: not a lecture PDF.
  const guide = first(
    await db
      .insert(resources)
      .values({
        userId: user.id,
        lectureId: lecture.id,
        kind: "study-guide",
        originalFilename: "Guide.docx",
        mimeType: "application/octet-stream",
        sizeBytes: 1,
        contentHash: "e".repeat(63) + String(sequence),
        storageKey: "sha256/x",
      })
      .returning(),
  );
  return { user, lecture, lecturePdf, guide, hash, scope: createUserScope(db, user.id) };
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

describe("an original lecture PDF", () => {
  it("is described to its owner from its registration", async () => {
    expect(await a.scope.originalLectures.get(a.lecturePdf.id)).toEqual({
      resourceId: a.lecturePdf.id,
      lectureId: a.lecture.id,
      originalFilename: "Lecture.pdf",
      sizeBytes: 1000,
      pageCount: 3,
      metadata: pdf.metadata,
      pagesWithoutText: [2],
      current: true,
    });
  });

  it("gives the server its stored file, for the owner only", async () => {
    expect(await a.scope.originalLectures.file(a.lecturePdf.id)).toMatchObject({
      contentHash: a.hash,
      storageKey: `sha256/${a.hash}`,
      mimeType: "application/pdf",
    });
    expect(await b.scope.originalLectures.file(a.lecturePdf.id)).toBeNull();
  });

  it("is not found for anyone else, for other kinds of material, or malformed ids", async () => {
    expect(await b.scope.originalLectures.get(a.lecturePdf.id)).toBeNull();
    expect(await a.scope.originalLectures.get(a.guide.id)).toBeNull();
    expect(await a.scope.originalLectures.file(a.guide.id)).toBeNull();
    expect(await a.scope.originalLectures.get("not-an-id")).toBeNull();
  });
});

describe("page annotations", () => {
  const create = (input: Parameters<typeof a.scope.originalLectures.annotations.create>[1]) =>
    a.scope.originalLectures.annotations.create(a.lecturePdf.id, input);

  it("mark pages that exist, once per page for bookmarks and Review Later", async () => {
    const first = await create({ kind: "bookmark", page: 2 });
    const again = await create({ kind: "bookmark", page: 2 });
    expect(first).toMatchObject({
      ok: true,
      annotation: { kind: "bookmark", page: 2, note: null },
    });
    expect(again.ok && first.ok && again.annotation.id === first.annotation.id).toBe(true);
    expect((await create({ kind: "review-later", page: 3 })).ok).toBe(true);
    for (const page of [0, 4, -1, 1.5]) {
      expect(await create({ kind: "bookmark", page })).toEqual({ ok: false, reason: "invalid" });
    }
  });

  it("keep notes as the user's own words, several per page, editable", async () => {
    const one = await create({ kind: "note", page: 1, note: "  First  " });
    const two = await create({ kind: "note", page: 1, note: "Second" });
    expect(one).toMatchObject({ ok: true, annotation: { note: "First" } });
    expect(two.ok).toBe(true);
    expect(await create({ kind: "note", page: 1, note: " " })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await create({ kind: "bookmark", page: 1, note: "x" })).toEqual({
      ok: false,
      reason: "invalid",
    });
    if (!one.ok) throw new Error("expected a note");
    expect(
      (await a.scope.originalLectures.annotations.updateNote(one.annotation.id, "Edited"))?.note,
    ).toBe("Edited");
    const pages = (await a.scope.originalLectures.annotations.list(a.lecturePdf.id)).map(
      (row) => row.page,
    );
    expect(pages).toEqual([...pages].sort((x, y) => x - y));
  });

  it("are private to their owner", async () => {
    const [mine] = await a.scope.originalLectures.annotations.list(a.lecturePdf.id);
    expect(await b.scope.originalLectures.annotations.list(a.lecturePdf.id)).toEqual([]);
    expect(
      await b.scope.originalLectures.annotations.create(a.lecturePdf.id, {
        kind: "bookmark",
        page: 1,
      }),
    ).toEqual({ ok: false, reason: "not-found" });
    expect(await b.scope.originalLectures.annotations.remove(mine!.id)).toBe(false);
    expect(await b.scope.originalLectures.annotations.updateNote(mine!.id, "x")).toBeNull();
    expect(await a.scope.originalLectures.annotations.remove(mine!.id)).toBe(true);
    expect(
      await a.scope.originalLectures.annotations.create(a.guide.id, { kind: "bookmark", page: 1 }),
    ).toEqual({ ok: false, reason: "not-found" });
  });

  it("cannot be attached to another user's PDF, even directly", async () => {
    const message = await violation(() =>
      db.insert(originalLectureAnnotations).values({
        userId: b.user.id,
        resourceId: a.lecturePdf.id,
        kind: "bookmark",
        page: 1,
        sourceContentHash: a.hash,
      }),
    );
    expect(message).toContain("original_lecture_annotations_resource_fk");
  });
});

describe("the viewer position", () => {
  it("remembers the last page, within the PDF, for its owner only", async () => {
    const position = a.scope.originalLectures.position;
    expect(await position.get(a.lecturePdf.id)).toBeNull();
    expect(await position.record(a.lecturePdf.id, 3)).toBe(3);
    expect(await position.record(a.lecturePdf.id, 2)).toBe(2);
    expect(await position.get(a.lecturePdf.id)).toBe(2);
    expect(await position.record(a.lecturePdf.id, 9)).toBeNull();
    expect(await b.scope.originalLectures.position.record(a.lecturePdf.id, 1)).toBeNull();
    expect(await b.scope.originalLectures.position.get(a.lecturePdf.id)).toBeNull();
  });

  it("and the annotations leave lecture completion alone", async () => {
    const rows = await db
      .select()
      .from(lectureProgress)
      .where(eq(lectureProgress.lectureId, a.lecture.id));
    expect(rows.every((row) => row.completedAt === null)).toBe(true);
    expect((await a.scope.lectures.detail(a.lecture.id))?.completedAt).toBeNull();
  });
});
