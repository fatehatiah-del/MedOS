// @vitest-environment node
import {
  type Database,
  type DatabaseConnection,
  createUserScope,
  ensureWorkspace,
  lectureProgress,
  lectures,
  users,
} from "@medos/database";
import { createTestDatabase } from "@medos/database/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { COMPLETION_INVALID, COMPLETION_NOT_FOUND, applyLectureCompletion } from "./completion";

let connection: DatabaseConnection;
let db: Database;

async function createStudent(label: string) {
  const [user] = await db
    .insert(users)
    .values({ email: `${label}@example.test`, displayName: label })
    .returning();
  if (!user) throw new Error("expected a user");
  await ensureWorkspace(db, user.id, { fixtureLectures: true });
  const [lecture] = await db.select().from(lectures).where(eq(lectures.userId, user.id)).limit(1);
  if (!lecture) throw new Error("expected a lecture");
  return { user, lecture, scope: createUserScope(db, user.id) };
}

let alice: Awaited<ReturnType<typeof createStudent>>;
let bob: Awaited<ReturnType<typeof createStudent>>;

beforeAll(async () => {
  connection = await createTestDatabase();
  db = connection.db;
  alice = await createStudent("alice");
  bob = await createStudent("bob");
});

afterAll(async () => {
  await connection.close();
});

const progressOf = async (lectureId: string) =>
  db.select().from(lectureProgress).where(eq(lectureProgress.lectureId, lectureId));

describe("applyLectureCompletion", () => {
  it("marks a lecture complete and incomplete again", async () => {
    const completed = await applyLectureCompletion(alice.scope, {
      lectureId: alice.lecture.id,
      completed: true,
    });
    expect(completed.ok).toBe(true);
    expect(completed.ok && completed.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const undone = await applyLectureCompletion(alice.scope, {
      lectureId: alice.lecture.id,
      completed: false,
    });
    expect(undone).toEqual({ ok: true, completedAt: null });
  });

  it("ignores a user id smuggled into the request", async () => {
    const result = await applyLectureCompletion(bob.scope, {
      lectureId: bob.lecture.id,
      completed: true,
      userId: alice.user.id,
    });

    // Bob's own lecture changed, recorded as Bob's; nothing was written for Alice.
    expect(result.ok).toBe(true);
    const [row] = await progressOf(bob.lecture.id);
    expect(row?.userId).toBe(bob.user.id);
    const aliceRows = await db
      .select()
      .from(lectureProgress)
      .where(eq(lectureProgress.userId, alice.user.id));
    expect(aliceRows.every((entry) => entry.lectureId === alice.lecture.id)).toBe(true);
  });

  it("cannot change another user's lecture", async () => {
    await applyLectureCompletion(alice.scope, { lectureId: alice.lecture.id, completed: false });

    const result = await applyLectureCompletion(bob.scope, {
      lectureId: alice.lecture.id,
      completed: true,
    });

    expect(result).toEqual({ ok: false, error: COMPLETION_NOT_FOUND });
    const [row] = await progressOf(alice.lecture.id);
    expect(row?.completedAt).toBeNull();
  });

  it("rejects malformed requests without touching anything", async () => {
    for (const input of [
      null,
      "complete",
      { lectureId: "lecture-1", completed: true },
      { lectureId: alice.lecture.id, completed: "yes" },
      { lectureId: alice.lecture.id },
    ]) {
      expect(await applyLectureCompletion(alice.scope, input)).toEqual({
        ok: false,
        error: COMPLETION_INVALID,
      });
    }
  });

  it("reports an unknown lecture as not found", async () => {
    expect(
      await applyLectureCompletion(alice.scope, {
        lectureId: "00000000-0000-4000-8000-000000000000",
        completed: true,
      }),
    ).toEqual({ ok: false, error: COMPLETION_NOT_FOUND });
  });
});
