import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database, DatabaseConnection } from "../client";
import { type Course, courses, lectureProgress } from "../schema";
import { ensureWorkspace } from "../seed/workspace";
import { createLecture, createUser, createWeek } from "../test-support";
import { createTestDatabase } from "../testing";

import { createUserScope } from "./user-scope";

/*
 * The planner at the trusted boundary: a day is suggested once and fits the
 * time available; the user's edits persist and are never overwritten; the
 * user can set every suggestion aside; nothing touches lecture completion.
 */

let connection: DatabaseConnection;
let db: Database;

// Monday 5 October 2026, 10:00 in Frankfurt: Pathophysiology is on the timetable.
const MONDAY = "2026-10-05" as const;
const NOW = new Date("2026-10-05T08:00:00Z");

async function createOwner(options: { cards?: number } = {}) {
  const user = await createUser(db);
  await ensureWorkspace(db, user.id);
  const owned = await db.select().from(courses).where(eq(courses.userId, user.id));
  const course = (slug: string) => owned.find((entry) => entry.slug === slug) as Course;
  const scope = createUserScope(db, user.id);

  // Week 1 lectures (already given), and a week 3 lecture (not yet given).
  const patho = course("pathophysiology");
  const pathoWeek = await createWeek(db, patho, 1);
  const pathoLecture = await createLecture(db, pathoWeek, 1);
  const pharma = course("pharmacology");
  const pharmaLecture = await createLecture(db, await createWeek(db, pharma, 1), 1);
  await createLecture(db, await createWeek(db, pharma, 3), 1);

  const deck = await scope.flashcards.decks.create(pharma.id, "Pharmacology");
  for (let index = 0; index < (options.cards ?? 12); index += 1) {
    await scope.flashcards.cards.create(deck!.id, { front: `Q${index}`, back: `A${index}` }, NOW);
  }
  return { user, scope, course, pathoLecture, pharmaLecture };
}

beforeAll(async () => {
  connection = await createTestDatabase();
  db = connection.db;
});

afterAll(async () => {
  await connection.close();
});

describe("study time", () => {
  it("defaults to 2h 30m on weekdays and 4h at weekends, and can be changed", async () => {
    const { scope } = await createOwner();
    expect(await scope.planner.settings.get()).toEqual({
      weekdayMinutes: 150,
      weekendMinutes: 240,
      custom: false,
    });
    expect(
      await scope.planner.settings.setAvailability({ weekdayMinutes: 90, weekendMinutes: 300 }),
    ).toBe(true);
    expect(
      await scope.planner.settings.setAvailability({ weekdayMinutes: -5, weekendMinutes: 300 }),
    ).toBe(false);
    expect(await scope.planner.settings.get()).toMatchObject({ weekdayMinutes: 90, custom: true });
  });
});

describe("suggesting a day", () => {
  it("proposes today's lecture first, with reasons, within the time available", async () => {
    const { scope, pathoLecture } = await createOwner();
    const plan = await scope.planner.forDate(MONDAY, NOW);
    if (!plan) throw new Error("no plan");

    expect(plan.availableMinutes).toBe(150);
    expect(plan.plannedMinutes).toBeLessThanOrEqual(150);
    expect(plan.items[0]).toMatchObject({
      source: "suggested",
      lecture: { id: pathoLecture.id },
      course: { slug: "pathophysiology" },
      minutes: 45,
    });
    expect(plan.items[0]?.reasons).toContain("Lecture today");
    const titles = plan.items.map((item) => item.title);
    expect(titles).toContain("Pharmacology flashcards");
    // The week 3 lecture has not been given yet.
    expect(
      plan.items.filter((item) => item.course?.slug === "pharmacology" && item.lecture),
    ).toHaveLength(1);
  });

  it("fits a smaller budget, never planning beyond it", async () => {
    const { scope } = await createOwner();
    await scope.planner.settings.setAvailability({ weekdayMinutes: 50, weekendMinutes: 240 });
    const plan = await scope.planner.forDate(MONDAY, NOW);
    expect(plan?.plannedMinutes).toBeLessThanOrEqual(50);
    expect(plan?.items.length).toBeGreaterThan(0);
  });

  it("gives the same plan for the same signals", async () => {
    const one = await createOwner();
    const two = await createOwner();
    const summary = async (scope: typeof one.scope) =>
      (await scope.planner.forDate(MONDAY, NOW))?.items.map((item) => [
        item.title,
        item.minutes,
        item.score,
        item.reasons,
      ]);
    expect(await summary(one.scope)).toEqual(await summary(two.scope));
  });

  it("plans a day once and never rebuilds it on its own", async () => {
    const { scope, course } = await createOwner();
    const first = await scope.planner.forDate(MONDAY, NOW);
    // New signals after the day was planned do not change it.
    const deck = await scope.flashcards.decks.create(course("pathology").id, "Pathology");
    await scope.flashcards.cards.create(deck!.id, { front: "Q", back: "A" }, NOW);
    const again = await scope.planner.forDate(MONDAY, NOW);
    expect(again?.items.map((item) => item.id)).toEqual(first?.items.map((item) => item.id));
  });

  it("suggests once even when two requests arrive together", async () => {
    const { scope } = await createOwner();
    const [a, b] = await Promise.all([
      scope.planner.forDate(MONDAY, NOW),
      scope.planner.forDate(MONDAY, NOW),
    ]);
    const after = await scope.planner.forDate(MONDAY, NOW);
    expect(after?.items.length).toBe(Math.max(a?.items.length ?? 0, b?.items.length ?? 0));
  });
});

describe("the user's edits", () => {
  it("persist, and survive a refresh of suggestions", async () => {
    const { scope } = await createOwner();
    const plan = await scope.planner.forDate(MONDAY, NOW);
    const [first, second] = plan!.items;
    if (!first || !second) throw new Error("expected two suggestions");

    expect(await scope.planner.items.update(first.id, { minutes: 25 })).toBe(true);
    expect(await scope.planner.items.update(first.id, { minutes: 2 })).toBe(false);
    const own = await scope.planner.items.add(MONDAY, {
      activity: "revision",
      title: "  Redo the receptor table ",
      minutes: 20,
    });
    expect(own).toMatchObject({ title: "Redo the receptor table", source: "manual" });

    const refreshed = await scope.planner.refresh(MONDAY, NOW);
    const kept = refreshed!.items.find((item) => item.id === first.id);
    expect(kept).toMatchObject({ minutes: 25, edited: true });
    expect(refreshed!.items.some((item) => item.id === own!.id)).toBe(true);
    expect(refreshed!.plannedMinutes).toBeLessThanOrEqual(refreshed!.availableMinutes);
  });

  it("reorder, tick off and remove; a removed suggestion is not proposed again", async () => {
    const { scope } = await createOwner();
    const plan = await scope.planner.forDate(MONDAY, NOW);
    const ids = plan!.items.map((item) => item.id);
    const reversed = [...ids].reverse();
    expect(await scope.planner.items.reorder(MONDAY, reversed)).toBe(true);
    expect(await scope.planner.items.reorder(MONDAY, reversed.slice(1))).toBe(false);
    expect((await scope.planner.forDate(MONDAY, NOW))!.items.map((item) => item.id)).toEqual(
      reversed,
    );

    const [top] = reversed;
    expect(await scope.planner.items.setDone(top!, true)).toBe(true);
    const removed = ids[0]!;
    // Today's lecture (Pathophysiology), identified by its lecture rather than its title.
    const removedLecture = plan!.items[0]!.lecture?.id;
    expect(removedLecture).toBeDefined();
    expect(await scope.planner.items.remove(removed)).toBe(true);

    const refreshed = await scope.planner.refresh(MONDAY, NOW);
    expect(refreshed!.items.find((item) => item.id === top)?.status).toBe("done");
    expect(refreshed!.items.map((item) => item.lecture?.id)).not.toContain(removedLecture);
    expect(refreshed!.setAside).toBe(1);
  });

  it("postpone an item to the next day, where suggestions fit around it", async () => {
    const { scope } = await createOwner();
    const plan = await scope.planner.forDate(MONDAY, NOW);
    const moved = plan!.items.find((item) => item.title === "Pharmacology flashcards");
    if (!moved) throw new Error("no flashcards item");

    expect(await scope.planner.items.postpone(moved.id)).toBe(true);
    expect((await scope.planner.forDate(MONDAY, NOW))!.items.map((item) => item.id)).not.toContain(
      moved.id,
    );

    const tuesday = await scope.planner.forDate("2026-10-06", new Date("2026-10-06T06:00:00Z"));
    const copies = tuesday!.items.filter((item) => item.title === "Pharmacology flashcards");
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({ source: "postponed", postponedFrom: MONDAY, position: 0 });
    expect(tuesday!.plannedMinutes).toBeLessThanOrEqual(tuesday!.availableMinutes);
  });

  it("can set every suggestion aside, leaving only the user's own plan", async () => {
    const { scope } = await createOwner();
    await scope.planner.forDate(MONDAY, NOW);
    await scope.planner.items.add(MONDAY, {
      activity: "other",
      title: "Anatomy atlas",
      minutes: 30,
    });
    const cleared = await scope.planner.clearSuggestions(MONDAY);
    expect(cleared!.items.map((item) => item.title)).toEqual(["Anatomy atlas"]);
    // Nothing comes back on its own.
    expect((await scope.planner.forDate(MONDAY, NOW))!.items).toHaveLength(1);
  });
});

describe("privacy and completion", () => {
  it("treats another user's items as missing", async () => {
    const mine = await createOwner();
    const theirs = await createOwner();
    const plan = await theirs.scope.planner.forDate(MONDAY, NOW);
    const id = plan!.items[0]!.id;
    expect(await mine.scope.planner.items.update(id, { minutes: 30 })).toBe(false);
    expect(await mine.scope.planner.items.remove(id)).toBe(false);
    expect(await mine.scope.planner.items.postpone(id)).toBe(false);
    expect(
      await mine.scope.planner.items.add(MONDAY, {
        activity: "revision",
        title: "x",
        minutes: 20,
        lectureId: theirs.pathoLecture.id,
      }),
    ).toBeNull();
  });

  it("never marks a lecture complete", async () => {
    const { scope, pathoLecture } = await createOwner();
    const plan = await scope.planner.forDate(MONDAY, NOW);
    for (const item of plan!.items) await scope.planner.items.setDone(item.id, true);
    expect(
      await db.select().from(lectureProgress).where(eq(lectureProgress.lectureId, pathoLecture.id)),
    ).toEqual([]);
  });
});
