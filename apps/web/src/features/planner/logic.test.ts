// @vitest-environment node
import {
  type Database,
  type DatabaseConnection,
  createUserScope,
  ensureWorkspace,
  users,
} from "@medos/database";
import { createTestDatabase } from "@medos/database/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getTodayOverview } from "@/features/today/get-today-overview";

import {
  MESSAGES,
  addItem,
  clearSuggestions,
  reorderItems,
  setAvailability,
  setItemDone,
  updateItem,
} from "./logic";

/* Study Plan actions as the browser calls them: untrusted input, the user's scope. */

let connection: DatabaseConnection;
let db: Database;
let sequence = 0;
const DAY = "2026-10-10";

async function createOwner() {
  sequence += 1;
  const [user] = await db
    .insert(users)
    .values({ email: `planner-${sequence}@example.test`, displayName: "Planner" })
    .returning();
  if (!user) throw new Error("no user");
  await ensureWorkspace(db, user.id);
  return createUserScope(db, user.id);
}

beforeAll(async () => {
  connection = await createTestDatabase();
  db = connection.db;
});

afterAll(async () => {
  await connection.close();
});

describe("Study Plan actions", () => {
  it("add, resize, reorder and tick off the user's own items", async () => {
    const scope = await createOwner();
    for (const title of ["Anatomy atlas", "Write summary"]) {
      expect(await addItem(scope, { date: DAY, activity: "other", title, minutes: 30 })).toEqual({
        ok: true,
      });
    }
    const plan = await scope.planner.get(DAY);
    const [first, second] = plan!.items;
    expect(await updateItem(scope, { itemId: first!.id, minutes: 45 })).toEqual({ ok: true });
    expect(await reorderItems(scope, { date: DAY, itemIds: [second!.id, first!.id] })).toEqual({
      ok: true,
    });
    expect(await setItemDone(scope, { itemId: second!.id, done: true })).toEqual({ ok: true });

    const after = await scope.planner.get(DAY);
    expect(after!.items.map((item) => [item.title, item.minutes, item.status])).toEqual([
      ["Write summary", 30, "done"],
      ["Anatomy atlas", 45, "planned"],
    ]);
    expect((await clearSuggestions(scope, { date: DAY })).ok).toBe(true);
  });

  it("refuses malformed input", async () => {
    const scope = await createOwner();
    for (const input of [
      { date: DAY, activity: "napping", title: "x", minutes: 30 },
      { date: DAY, activity: "other", title: "x", minutes: 3 },
      { date: "10/10/2026", activity: "other", title: "x", minutes: 30 },
    ]) {
      expect(await addItem(scope, input)).toEqual({ ok: false, error: MESSAGES.invalid });
    }
    expect(await updateItem(scope, { itemId: "not-an-id", minutes: 30 })).toEqual({
      ok: false,
      error: MESSAGES.invalid,
    });
    expect(await setAvailability(scope, { weekdayMinutes: 2000, weekendMinutes: 60 })).toEqual({
      ok: false,
      error: MESSAGES.availability,
    });
  });

  it("puts the day's real plan on Today", async () => {
    const scope = await createOwner();
    await addItem(scope, {
      date: "2026-10-07",
      activity: "revision",
      title: "Kinetics",
      minutes: 25,
    });
    const today = await getTodayOverview(scope, new Date("2026-10-07T13:00:00Z"));
    expect(today.plan).toEqual([
      expect.objectContaining({
        title: "Kinetics",
        minutes: 25,
        activity: "revision",
        done: false,
      }),
    ]);
  });
});
