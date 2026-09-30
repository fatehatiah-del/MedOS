import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database, DatabaseConnection } from "../client";
import { lectureProgress, lectures, resources } from "../schema";
import { createCourseForNewUser, createLecture, createWeek, first } from "../test-support";
import { createTestDatabase } from "../testing";

import { createUserScope } from "./user-scope";

/*
 * Cross-user privacy, tested at the trusted boundary: the data-access layer
 * the application uses for every read and write. Two users, A and B, each
 * have the same kind of data. Nothing B can call may reveal or change A's.
 */

let connection: DatabaseConnection;
let db: Database;

async function createWorkspace() {
  const { user, semester, course } = await createCourseForNewUser(db);
  const week = await createWeek(db, course, 4);
  const lecture = await createLecture(db, week, 1);
  const resource = first(
    await db
      .insert(resources)
      .values({
        userId: user.id,
        lectureId: lecture.id,
        kind: "study-guide",
        originalFilename: "StudyGuide.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sizeBytes: 1024,
        contentHash: "c".repeat(64),
        sourcePath: "Pharma/w4/lecture-1/StudyGuide.docx",
        storageKey: `originals/${user.id}/study-guide`,
      })
      .returning(),
  );
  return { user, semester, course, week, lecture, resource, scope: createUserScope(db, user.id) };
}

let a: Awaited<ReturnType<typeof createWorkspace>>;
let b: Awaited<ReturnType<typeof createWorkspace>>;

beforeAll(async () => {
  connection = await createTestDatabase();
  db = connection.db;
  a = await createWorkspace();
  b = await createWorkspace();
});

afterAll(async () => {
  await connection.close();
});

describe("a user's own data", () => {
  it("is fully readable through their scope", async () => {
    expect((await a.scope.semesters.list()).map((row) => row.id)).toEqual([a.semester.id]);
    expect((await a.scope.courses.list()).map((row) => row.id)).toEqual([a.course.id]);
    expect((await a.scope.courses.get(a.course.id))?.id).toBe(a.course.id);
    expect((await a.scope.lectures.get(a.lecture.id))?.id).toBe(a.lecture.id);

    const weeks = await a.scope.courses.weeks(a.course.id);
    expect(weeks?.map((week) => [week.number, week.lectures.length])).toEqual([[4, 1]]);
  });

  it("can be marked complete and incomplete again, only by explicit request", async () => {
    const at = new Date("2026-10-21T18:00:00Z");

    const completed = await a.scope.lectures.setCompleted(a.lecture.id, true, at);
    expect(completed?.completedAt).toEqual(at);

    const undone = await a.scope.lectures.setCompleted(a.lecture.id, false);
    expect(undone?.completedAt).toBeNull();
    expect(undone?.id).toBe(completed?.id);
  });
});

describe("user B cannot read user A's data", () => {
  it("never sees A's rows in lists", async () => {
    const courseIds = (await b.scope.courses.list()).map((row) => row.id);
    const semesterIds = (await b.scope.semesters.list()).map((row) => row.id);

    expect(courseIds).toEqual([b.course.id]);
    expect(courseIds).not.toContain(a.course.id);
    expect(semesterIds).toEqual([b.semester.id]);
  });

  it("gets nothing when asking for A's records by id", async () => {
    expect(await b.scope.courses.get(a.course.id)).toBeNull();
    expect(await b.scope.courses.weeks(a.course.id)).toBeNull();
    expect(await b.scope.lectures.get(a.lecture.id)).toBeNull();
    expect(await b.scope.resources.get(a.resource.id)).toBeNull();
    expect(await b.scope.resources.listForLecture(a.lecture.id)).toEqual([]);
  });

  it("cannot tell another user's record from one that does not exist", async () => {
    const missing = "00000000-0000-4000-8000-000000000000";

    expect(await b.scope.lectures.get(a.lecture.id)).toEqual(await b.scope.lectures.get(missing));
    expect(await b.scope.resources.get(a.resource.id)).toEqual(
      await b.scope.resources.get(missing),
    );
  });
});

describe("user B cannot change user A's data", () => {
  it("cannot mark A's lecture complete", async () => {
    await a.scope.lectures.setCompleted(a.lecture.id, false);

    expect(await b.scope.lectures.setCompleted(a.lecture.id, true)).toBeNull();

    const rows = await db
      .select()
      .from(lectureProgress)
      .where(eq(lectureProgress.lectureId, a.lecture.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe(a.user.id);
    expect(rows[0]?.completedAt).toBeNull();
  });

  it("cannot undo A's completion", async () => {
    const at = new Date("2026-10-22T08:00:00Z");
    await a.scope.lectures.setCompleted(a.lecture.id, true, at);

    expect(await b.scope.lectures.setCompleted(a.lecture.id, false)).toBeNull();

    const [row] = await db
      .select()
      .from(lectureProgress)
      .where(eq(lectureProgress.lectureId, a.lecture.id));
    expect(row?.completedAt).toEqual(at);
  });

  it("leaves A's lecture itself untouched", async () => {
    await b.scope.lectures.setCompleted(a.lecture.id, true);

    const [row] = await db.select().from(lectures).where(eq(lectures.id, a.lecture.id));
    expect(row).toEqual(a.lecture);
  });
});

describe("the scope itself", () => {
  it("treats malformed identifiers as not found instead of failing", async () => {
    expect(await a.scope.courses.get("not-a-uuid")).toBeNull();
    expect(await a.scope.lectures.get("1; drop table lectures")).toBeNull();
    expect(await a.scope.resources.get("../../etc/passwd")).toBeNull();
    expect(await a.scope.lectures.setCompleted("nope", true)).toBeNull();
  });

  it("refuses to be created without a valid user", () => {
    expect(() => createUserScope(db, "")).toThrow(/valid user id/);
    expect(() => createUserScope(db, "anonymous")).toThrow(/valid user id/);
  });

  it("never exposes where a file is stored", async () => {
    const summary = await a.scope.resources.get(a.resource.id);

    expect(summary).toMatchObject({ id: a.resource.id, originalFilename: "StudyGuide.docx" });
    expect(summary).not.toHaveProperty("storageKey");
    expect(summary).not.toHaveProperty("sourcePath");
    expect(summary).not.toHaveProperty("contentHash");
  });
});
