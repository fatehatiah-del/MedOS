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
  createAnnotation,
  recordReadingProgress,
  removeAnnotation,
  updateAnnotationNote,
} from "./annotations";
import { syntheticGuide } from "./test-guide";

/*
 * The reader's actions as the browser calls them: untrusted input, the
 * signed-in user's scope, and never any effect on lecture completion.
 */

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
      .values({ email: `reader-${sequence}@example.test`, displayName: "Reader" })
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
  const resource = await only(
    db
      .insert(resources)
      .values({
        ...owned,
        lectureId: lecture.id,
        kind: "study-guide",
        originalFilename: "StudyGuide.docx",
        mimeType: "application/octet-stream",
        sizeBytes: 1,
        contentHash: hash,
        storageKey: `sha256/${hash}`,
        status: "parsed",
      })
      .returning(),
  );
  await db.insert(resourceContents).values({
    ...owned,
    resourceId: resource.id,
    format: "study-guide",
    parser: "docx-study-guide",
    parserVersion: 1,
    sourceContentHash: hash,
    content: syntheticGuide(),
    extractedAt: new Date(),
  });
  return { user, lecture, resource, scope: createUserScope(db, user.id) };
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

const passage = () => ({
  resourceId: a.resource.id,
  kind: "highlight",
  sectionId: "1-first-part",
  unitPath: "0",
  start: 0,
  end: 5,
  quote: "Alpha",
});

describe("reader actions", () => {
  it("save a highlight for the signed-in user, ignoring any user id sent", async () => {
    const result = await createAnnotation(a.scope, { ...passage(), userId: b.user.id });
    expect(result.ok).toBe(true);
    expect(await a.scope.studyGuides.annotations.list(a.resource.id)).toHaveLength(1);
    expect(await b.scope.studyGuides.annotations.list(a.resource.id)).toHaveLength(0);
  });

  it("refuse malformed input with a message the user can act on", async () => {
    for (const input of [
      null,
      "x",
      { ...passage(), resourceId: "1" },
      { ...passage(), kind: "flashcard" },
      { ...passage(), start: -1 },
      { ...passage(), quote: "x".repeat(6000) },
    ]) {
      expect(await createAnnotation(a.scope, input)).toEqual({
        ok: false,
        error: MESSAGES.invalid,
      });
    }
    expect(await createAnnotation(a.scope, { ...passage(), quote: "Other" })).toEqual({
      ok: false,
      error: MESSAGES.mismatch,
    });
    expect(await createAnnotation(a.scope, { ...passage(), kind: "note", note: " " })).toEqual({
      ok: false,
      error: MESSAGES.emptyNote,
    });
  });

  it("cannot reach another user's guide or annotations", async () => {
    expect(await createAnnotation(b.scope, passage())).toEqual({
      ok: false,
      error: MESSAGES.notFound,
    });
    const [mine] = await a.scope.studyGuides.annotations.list(a.resource.id);
    expect(await removeAnnotation(b.scope, { annotationId: mine?.id })).toEqual({
      ok: false,
      error: MESSAGES.annotationMissing,
    });
    expect(await updateAnnotationNote(b.scope, { annotationId: mine?.id, note: "x" })).toEqual({
      ok: false,
      error: MESSAGES.annotationMissing,
    });
    expect(
      await recordReadingProgress(b.scope, { resourceId: a.resource.id, sectionId: "deep" }),
    ).toEqual({ ok: false, error: MESSAGES.notFound });
  });

  it("save, edit and remove notes", async () => {
    const created = await createAnnotation(a.scope, { ...passage(), kind: "note", note: "Mine" });
    if (!created.ok) throw new Error(created.error);
    expect(
      await updateAnnotationNote(a.scope, { annotationId: created.value.id, note: "Edited" }),
    ).toEqual({ ok: true, value: undefined });
    expect(await removeAnnotation(a.scope, { annotationId: created.value.id })).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("record reading progress to 100% without completing the lecture", async () => {
    const result = await recordReadingProgress(a.scope, {
      resourceId: a.resource.id,
      sectionId: "deep",
    });
    expect(result).toMatchObject({ ok: true, value: { percent: 100, sectionsRead: 4 } });

    const rows = await db
      .select()
      .from(lectureProgress)
      .where(eq(lectureProgress.lectureId, a.lecture.id));
    expect(rows.every((row) => row.completedAt === null)).toBe(true);
    expect((await a.scope.lectures.detail(a.lecture.id))?.completedAt).toBeNull();
  });
});
