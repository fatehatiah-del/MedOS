import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database, DatabaseConnection } from "../client";
import { createCourseForNewUser, createLecture, createWeek } from "../test-support";
import { createTestDatabase } from "../testing";

import { createUserScope } from "./user-scope";

/*
 * Lecture notebooks: one per lecture, private to its owner, and a save made
 * against an older revision is refused instead of overwriting newer notes.
 */

let connection: DatabaseConnection;
let db: Database;

const doc = (text: string) => ({
  type: "doc" as const,
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

async function createOwner() {
  const { user, course } = await createCourseForNewUser(db);
  const lecture = await createLecture(db, await createWeek(db, course, 2), 1);
  return { course, lecture, scope: createUserScope(db, user.id) };
}

beforeAll(async () => {
  connection = await createTestDatabase();
  db = connection.db;
});

afterAll(async () => {
  await connection.close();
});

describe("lecture notebooks", () => {
  it("start empty, then keep what was saved", async () => {
    const { lecture, scope } = await createOwner();

    const empty = await scope.notebooks.get(lecture.id);
    expect(empty).toMatchObject({ revision: 0, updatedAt: null, content: { type: "doc" } });

    const saved = await scope.notebooks.save(lecture.id, {
      content: doc("Neutropenia < 1500/μl"),
      plainText: "Neutropenia < 1500/μl",
      baseRevision: 0,
    });
    expect(saved).toMatchObject({ status: "saved", revision: 1 });

    const again = await scope.notebooks.save(lecture.id, {
      content: doc("Neutropenia < 1500/μl; agranulocytosis < 100/μl"),
      plainText: "Neutropenia < 1500/μl; agranulocytosis < 100/μl",
      baseRevision: 1,
    });
    expect(again).toMatchObject({ status: "saved", revision: 2 });
    expect((await scope.notebooks.get(lecture.id))?.content).toEqual(
      doc("Neutropenia < 1500/μl; agranulocytosis < 100/μl"),
    );
  });

  it("refuse a save from a stale copy and return the current notes", async () => {
    const { lecture, scope } = await createOwner();
    await scope.notebooks.save(lecture.id, { content: doc("A"), plainText: "A", baseRevision: 0 });
    await scope.notebooks.save(lecture.id, { content: doc("B"), plainText: "B", baseRevision: 1 });

    const stale = await scope.notebooks.save(lecture.id, {
      content: doc("from another tab"),
      plainText: "from another tab",
      baseRevision: 1,
    });
    expect(stale.status).toBe("conflict");
    if (stale.status !== "conflict") return;
    expect(stale.current).toMatchObject({ revision: 2, content: doc("B") });

    const firstWrite = await scope.notebooks.save(lecture.id, {
      content: doc("C"),
      plainText: "C",
      baseRevision: 0,
    });
    expect(firstWrite.status).toBe("conflict");
  });

  it("are private to their owner", async () => {
    const { lecture, scope } = await createOwner();
    const other = await createOwner();
    await scope.notebooks.save(lecture.id, {
      content: doc("mine"),
      plainText: "mine",
      baseRevision: 0,
    });

    expect(await other.scope.notebooks.get(lecture.id)).toBeNull();
    expect(
      await other.scope.notebooks.save(lecture.id, {
        content: doc("x"),
        plainText: "x",
        baseRevision: 1,
      }),
    ).toEqual({ status: "not-found" });
    expect(await other.scope.notebooks.list()).toEqual([]);
  });

  it("are listed with their lecture, and empty ones are left out", async () => {
    const { course, lecture, scope } = await createOwner();
    const blank = await createLecture(db, await createWeek(db, course, 3), 1);
    await scope.notebooks.save(lecture.id, {
      content: doc("Left shift"),
      plainText: "Left shift",
      baseRevision: 0,
    });
    await scope.notebooks.save(blank.id, {
      content: { type: "doc" },
      plainText: "",
      baseRevision: 0,
    });

    const listed = await scope.notebooks.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      lectureId: lecture.id,
      weekNumber: 2,
      excerpt: "Left shift",
      course: { slug: course.slug },
    });
  });

  it("reject something that is not a notebook document", async () => {
    const { lecture, scope } = await createOwner();
    const result = await scope.notebooks.save(lecture.id, {
      content: { type: "paragraph" } as never,
      plainText: "",
      baseRevision: 0,
    });
    expect(result.status).toBe("invalid");
  });
});
