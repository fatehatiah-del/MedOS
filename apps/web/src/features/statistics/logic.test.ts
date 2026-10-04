// @vitest-environment node
import {
  type Database,
  type DatabaseConnection,
  courses,
  createUserScope,
  ensureWorkspace,
  users,
} from "@medos/database";
import { createTestDatabase } from "@medos/database/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MESSAGES, markDifficult, unmarkDifficult } from "./logic";

/* Marking concepts difficult as the browser calls it: untrusted input, the user's scope. */

let connection: DatabaseConnection;
let db: Database;
let sequence = 0;

async function createOwner() {
  sequence += 1;
  const [user] = await db
    .insert(users)
    .values({ email: `stats-${sequence}@example.test`, displayName: "Stats" })
    .returning();
  if (!user) throw new Error("no user");
  await ensureWorkspace(db, user.id);
  const [course] = await db.select().from(courses).where(eq(courses.userId, user.id));
  return { scope: createUserScope(db, user.id), courseId: course!.id };
}

beforeAll(async () => {
  connection = await createTestDatabase();
  db = connection.db;
});

afterAll(async () => {
  await connection.close();
});

describe("marking concepts difficult", () => {
  it("marks and unmarks a concept, which then shows as a weak spot", async () => {
    const { scope, courseId } = await createOwner();
    expect(await markDifficult(scope, { courseId, label: "Tachyphylaxis" })).toEqual({ ok: true });
    const [weakness] = await scope.statistics.weaknesses(courseId);
    expect(weakness).toMatchObject({ kind: "concept", label: "Tachyphylaxis" });
    expect(await unmarkDifficult(scope, { conceptId: weakness!.difficultId })).toEqual({
      ok: true,
    });
    expect(await scope.statistics.weaknesses(courseId)).toEqual([]);
  });

  it("refuses empty or overlong names, and another user's course", async () => {
    const { scope, courseId } = await createOwner();
    const other = await createOwner();
    for (const input of [
      { courseId, label: "   " },
      { courseId, label: "x".repeat(121) },
      { courseId: other.courseId, label: "Receptors" },
      { courseId: "not-a-course", label: "Receptors" },
    ]) {
      expect(await markDifficult(scope, input)).toEqual({ ok: false, error: MESSAGES.invalid });
    }
    expect(await unmarkDifficult(scope, { conceptId: "nope" })).toEqual({
      ok: false,
      error: MESSAGES.gone,
    });
  });
});
