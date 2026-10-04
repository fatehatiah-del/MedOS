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

import { getTodayOverview } from "@/features/today/get-today-overview";

import { MESSAGES, addExam, createEvent, deleteEvent, setEventNotes, updateEvent } from "./logic";

/* Calendar actions as the browser calls them: wall-clock input, the user's scope. */

let connection: DatabaseConnection;
let db: Database;
let sequence = 0;

async function createOwner() {
  sequence += 1;
  const [user] = await db
    .insert(users)
    .values({ email: `calendar-${sequence}@example.test`, displayName: "Calendar" })
    .returning();
  if (!user) throw new Error("no user");
  await ensureWorkspace(db, user.id);
  const owned = await db.select().from(courses).where(eq(courses.userId, user.id));
  return {
    scope: createUserScope(db, user.id),
    courseId: (slug: string) => owned.find((course) => course.slug === slug)?.id ?? "",
  };
}

beforeAll(async () => {
  connection = await createTestDatabase();
  db = connection.db;
});

afterAll(async () => {
  await connection.close();
});

describe("own events", () => {
  it("are stored at campus wall-clock time, edited and deleted", async () => {
    const { scope } = await createOwner();
    const created = await createEvent(scope, {
      type: "revision",
      title: "Receptors",
      date: "2026-10-27",
      allDay: false,
      start: "18:00",
      end: "19:30",
    });
    if (!created.ok) throw new Error(created.error);
    const stored = await scope.calendar.get(created.value.eventId);
    // 27 October is in winter time: UTC+1.
    expect(stored?.startsAt.toISOString()).toBe("2026-10-27T17:00:00.000Z");
    expect(stored?.endsAt.toISOString()).toBe("2026-10-27T18:30:00.000Z");

    const updated = await updateEvent(scope, {
      eventId: created.value.eventId,
      type: "personal",
      title: "Trip",
      date: "2026-10-30",
      allDay: true,
      endDate: "2026-11-01",
    });
    expect(updated.ok).toBe(true);
    const trip = await scope.calendar.get(created.value.eventId);
    expect(trip).toMatchObject({ allDay: true, title: "Trip" });
    expect(trip?.endsAt.toISOString()).toBe("2026-11-01T23:00:00.000Z");

    expect(await deleteEvent(scope, { eventId: created.value.eventId })).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("refuse an end before the start, a missing title or a university type", async () => {
    const { scope } = await createOwner();
    const base = { type: "personal", title: "x", date: "2026-10-27", allDay: false };
    for (const input of [
      { ...base, start: "10:00", end: "09:00" },
      { ...base, start: "10:00", end: "10:00" },
      { ...base, title: "", start: "10:00", end: "11:00" },
      { ...base, type: "lecture", start: "10:00", end: "11:00" },
      { ...base, allDay: true, endDate: "2026-10-26" },
      { ...base, date: "27/10/2026", start: "10:00", end: "11:00" },
    ]) {
      expect(await createEvent(scope, input)).toEqual({ ok: false, error: MESSAGES.invalid });
    }
  });
});

describe("university events and exams", () => {
  it("keep notes on a timetable event but refuse to delete it", async () => {
    const { scope } = await createOwner();
    const [lecture] = await scope.calendar.between(
      new Date("2026-10-06T07:00:00Z"),
      new Date("2026-10-06T11:00:00Z"),
    );
    if (!lecture) throw new Error("no lecture");
    expect(await deleteEvent(scope, { eventId: lecture.id })).toEqual({
      ok: false,
      error: MESSAGES.readOnly,
    });
    expect((await setEventNotes(scope, { eventId: lecture.id, notes: "Quiz" })).ok).toBe(true);
  });

  it("adds a course exam from wall-clock input", async () => {
    const { scope, courseId } = await createOwner();
    const added = await addExam(scope, {
      courseId: courseId("microbiology"),
      kind: "final",
      date: "2027-01-21",
      start: "09:00",
      end: "11:00",
      location: "Sigma",
    });
    if (!added.ok) throw new Error(added.error);
    const exam = await scope.calendar.get(added.value.eventId);
    expect(exam).toMatchObject({
      title: "Medical Microbiology I — Final exam",
      exam: { kind: "final" },
    });
    expect(exam?.startsAt.toISOString()).toBe("2027-01-21T08:00:00.000Z");
  });
});

describe("Today", () => {
  it("shows the real date and the day's Group A schedule", async () => {
    const { scope } = await createOwner();
    // Wednesday 7 October 2026, 15:00 in Frankfurt.
    const today = await getTodayOverview(scope, new Date("2026-10-07T13:00:00Z"));
    expect(today.date).toBe("2026-10-07");
    expect(today.time).toBe("15:00");
    expect(
      today.schedule.map((entry) => [
        entry.courseId,
        entry.kind,
        entry.start,
        entry.end,
        entry.location,
      ]),
    ).toEqual([
      ["public-health", "lecture", "11:30", "14:50", "Sigma"],
      ["communication-skills", "lab", "16:30", "17:30", "TBL 1"],
      ["communication-skills", "lecture", "19:50", "20:40", "Sigma"],
    ]);
  });

  it("has no university schedule on a public holiday", async () => {
    const { scope } = await createOwner();
    const today = await getTodayOverview(scope, new Date("2026-10-28T10:00:00Z"));
    expect(today.schedule).toEqual([]);
  });
});
