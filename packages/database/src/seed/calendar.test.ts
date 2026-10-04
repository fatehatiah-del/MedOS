import { and, eq, isNotNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database, DatabaseConnection } from "../client";
import { calendarEvents, courses, semesters } from "../schema";
import { createUser, first } from "../test-support";
import { createTestDatabase } from "../testing";

import { importUniversityCalendar, universityCalendarFor } from "./calendar";
import { ensureWorkspace } from "./workspace";

/*
 * The university calendar on a user's calendar: Group A's week on every
 * teaching day plus the academic dates, imported once, idempotent, never
 * touching the user's notes or own events.
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

async function eventsOf(userId: string) {
  return db.select().from(calendarEvents).where(eq(calendarEvents.userId, userId));
}

describe("university calendar import", () => {
  it("is imported when the workspace is first opened", async () => {
    const user = await createUser(db);
    const semester = await ensureWorkspace(db, user.id);
    const calendar = universityCalendarFor(semester.slug);

    expect(semester.calendarVersion).toBe(calendar?.version);
    const events = await eventsOf(user.id);
    expect(events).toHaveLength(calendar?.events.length ?? -1);
    expect(events.filter((event) => !event.allDay)).toHaveLength(217);
    expect(events.every((event) => event.origin === "university")).toBe(true);
  });

  it("shows shared lectures and Group A's labs only, each with its course", async () => {
    const user = await createUser(db);
    await ensureWorkspace(db, user.id);
    const events = await eventsOf(user.id);
    const owned = await db.select().from(courses).where(eq(courses.userId, user.id));
    const slugOf = new Map(owned.map((course) => [course.id, course.slug]));

    const labs = events.filter((event) => event.type === "lab");
    expect(labs.length).toBeGreaterThan(0);
    expect(labs.every((event) => event.studentGroup === "A")).toBe(true);
    const lectures = events.filter((event) => event.type === "lecture");
    expect(lectures.every((event) => event.studentGroup === null)).toBe(true);
    expect(new Set(lectures.map((event) => slugOf.get(event.courseId ?? "")))).toEqual(
      new Set([
        "pathology",
        "pathophysiology",
        "microbiology",
        "pharmacology",
        "public-health",
        "communication-skills",
      ]),
    );

    const friday = events.find(
      (event) => event.sourceKey === "2026-fall:lab-pathology-5-14:45@2026-10-02",
    );
    expect(friday).toMatchObject({ title: "Pathology Lab", location: "Sectra" });
    expect(friday?.startsAt.toISOString()).toBe("2026-10-02T12:45:00.000Z");
  });

  it("is a no-op when imported again, and keeps the user's notes", async () => {
    const user = await createUser(db);
    const semester = await ensureWorkspace(db, user.id);
    const [lecture] = await db
      .update(calendarEvents)
      .set({ notes: "Bring the lab coat" })
      .where(
        and(
          eq(calendarEvents.userId, user.id),
          eq(calendarEvents.sourceKey, "2026-fall:lecture-pharmacology-2-09:50@2026-10-06"),
        ),
      )
      .returning();
    const before = await eventsOf(user.id);

    const result = await importUniversityCalendar(db, semester);
    expect(result?.removed).toBe(0);
    const after = await eventsOf(user.id);
    expect(after).toHaveLength(before.length);
    const again = after.find((event) => event.id === lecture?.id);
    expect(again?.notes).toBe("Bring the lab coat");
    // Unchanged rows are not rewritten.
    expect(again?.updatedAt).toEqual(lecture?.updatedAt);
  });

  it("re-imports when the data changed, removing stale events but not the user's own", async () => {
    const user = await createUser(db);
    const semester = await ensureWorkspace(db, user.id);
    const stale = first(
      await db
        .insert(calendarEvents)
        .values({
          userId: user.id,
          type: "lecture",
          origin: "university",
          title: "A lecture no longer in the timetable",
          startsAt: new Date("2026-10-07T08:00:00Z"),
          endsAt: new Date("2026-10-07T09:00:00Z"),
          timezone: "Europe/Berlin",
          sourceKey: "2026-fall:lecture-gone@2026-10-07",
        })
        .returning(),
    );
    const own = first(
      await db
        .insert(calendarEvents)
        .values({
          userId: user.id,
          type: "personal",
          origin: "personal",
          title: "Dentist",
          startsAt: new Date("2026-10-07T15:00:00Z"),
          endsAt: new Date("2026-10-07T16:00:00Z"),
          timezone: "Europe/Berlin",
        })
        .returning(),
    );
    // As if an older version of the calendar data had been imported.
    await db
      .update(semesters)
      .set({ calendarVersion: "older" })
      .where(eq(semesters.id, semester.id));

    await ensureWorkspace(db, user.id);

    const ids = (await eventsOf(user.id)).map((event) => event.id);
    expect(ids).not.toContain(stale.id);
    expect(ids).toContain(own.id);
  });

  it("imports each event once even when two first requests race", async () => {
    const user = await createUser(db);
    await Promise.all([ensureWorkspace(db, user.id), ensureWorkspace(db, user.id)]);
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(calendarEvents)
      .where(and(eq(calendarEvents.userId, user.id), isNotNull(calendarEvents.sourceKey)));
    expect(row?.n).toBe(universityCalendarFor("2026-fall")?.events.length);
  });
});
