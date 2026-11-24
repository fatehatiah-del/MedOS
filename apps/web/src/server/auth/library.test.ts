// @vitest-environment node
import { type Database, type DatabaseConnection, semesters, users } from "@medos/database";
import { createTestDatabase } from "@medos/database/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { giveLibraryTo } from "./library";

/*
 * The sign-up hook's own rules. The copy itself is `mirrorLibrary`, tested in
 * the sync package against synthetic study folders.
 */

let connection: DatabaseConnection;
let db: Database;

beforeAll(async () => {
  connection = await createTestDatabase();
  db = connection.db;
});

afterAll(async () => {
  await connection.close();
});

async function account(email: string) {
  const [user] = await db.insert(users).values({ email, displayName: email }).returning();
  if (!user) throw new Error("user was not created");
  return { id: user.id, email };
}

const workspaceOf = (userId: string) =>
  db.select().from(semesters).where(eq(semesters.userId, userId));

describe("giveLibraryTo", () => {
  it("does nothing when no source account is configured", async () => {
    const user = await account("nosource@example.test");
    await giveLibraryTo(db, null, user);
    expect(await workspaceOf(user.id)).toEqual([]);
  });

  it("never mirrors the source account into itself", async () => {
    const owner = await account("owner-self@example.test");
    await expect(giveLibraryTo(db, "owner-self@example.test", owner)).resolves.toBeUndefined();
  });

  it("does not fail the sign-up when the source account does not exist", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const user = await account("orphan@example.test");
    await expect(giveLibraryTo(db, "missing@example.test", user)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("gives a new account the source's workspace", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await account("owner@example.test");
    const user = await account("newcomer@example.test");
    await giveLibraryTo(db, "owner@example.test", user);
    // The owner has no material here, but the newcomer still gets a semester to study in.
    expect(await workspaceOf(user.id)).toHaveLength(1);
    info.mockRestore();
  });
});
