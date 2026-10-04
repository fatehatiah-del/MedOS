import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database, DatabaseConnection } from "../client";
import { courses, examEvents } from "../schema";
import { ensureWorkspace } from "../seed/workspace";
import { createUser } from "../test-support";
import { createTestDatabase } from "../testing";

import { createUserScope } from "./user-scope";

/*
 * The calendar at the trusted boundary: imported university events are
 * read-only apart from notes, the user's own events and exams are editable,
 * and nothing of another user's can be seen or changed.
 */

let connection: DatabaseConnection;
let db: Database;

const ZONE = "Europe/Berlin";
const at = (iso: string) => new Date(iso);

async function createOwner() {
  const user = await createUser(db);
  const semester = await ensureWorkspace(db, user.id);
  const owned = await db.select().from(courses).where(eq(courses.userId, user.id));
  const course = (slug: string) => {
    const found = owned.find((entry) => entry.slug === slug);
    if (!found) throw new Error(slug);
    return found;
  };
  return { user, semester, course, scope: createUserScope(db, user.id) };
}

beforeAll(async () => {
  connection = await createTestDatabase();
  db = connection.db;
});

afterAll(async () => {
  await connection.close();
});

describe("reading the calendar", () => {
  it("returns a week of Group A's timetable with the academic dates around it", async () => {
    const { scope } = await createOwner();
    // Monday 5 to Saturday 10 October 2026, Frankfurt time.
    const events = await scope.calendar.between(
      at("2026-10-04T22:00:00Z"),
      at("2026-10-10T22:00:00Z"),
    );
    const sessions = events.filter((event) => !event.allDay);
    expect(sessions).toHaveLength(18);
    expect(
      sessions.every((event) => event.studentGroup === null || event.studentGroup === "A"),
    ).toBe(true);
    expect(events.find((event) => event.allDay)?.title).toBe("Last day to add/drop a course");
    expect(sessions[0]).toMatchObject({
      title: "Pathophysiology I",
      type: "lecture",
      location: "Sigma",
      imported: true,
      course: { slug: "pathophysiology" },
    });
  });

  it("shows nothing taught in the midterm period, only the period itself", async () => {
    const { scope } = await createOwner();
    const events = await scope.calendar.between(
      at("2026-11-11T23:00:00Z"),
      at("2026-11-18T23:00:00Z"),
    );
    expect(events.map((event) => event.title)).toEqual(["Midterm period"]);
  });
});

describe("the user's own events", () => {
  const base = {
    type: "revision" as const,
    title: "  Revise receptors  ",
    startsAt: at("2026-10-10T08:00:00Z"),
    endsAt: at("2026-10-10T10:00:00Z"),
    allDay: false,
    timezone: ZONE,
  };

  it("are created, edited and deleted", async () => {
    const { scope, course } = await createOwner();
    const created = await scope.calendar.create({
      ...base,
      courseId: course("pharmacology").id,
      notes: "Chapter 2",
    });
    if (!created.ok) throw new Error(created.reason);
    expect(created.event).toMatchObject({
      title: "Revise receptors",
      origin: "personal",
      imported: false,
      notes: "Chapter 2",
      course: { slug: "pharmacology" },
    });

    const updated = await scope.calendar.update(created.event.id, {
      ...base,
      type: "personal",
      title: "Dentist",
      courseId: null,
      location: "Zeil 5",
    });
    expect(updated).toMatchObject({
      ok: true,
      event: { type: "personal", title: "Dentist", location: "Zeil 5", course: null, notes: null },
    });

    expect(await scope.calendar.remove(created.event.id)).toEqual({ ok: true });
    expect(await scope.calendar.get(created.event.id)).toBeNull();
  });

  it("refuse university types, empty titles, reversed times and another user's course", async () => {
    const { scope } = await createOwner();
    const other = await createOwner();
    for (const input of [
      { ...base, type: "lecture" as never },
      { ...base, title: "   " },
      { ...base, endsAt: at("2026-10-10T07:00:00Z") },
      { ...base, courseId: other.course("pathology").id },
      { ...base, notes: "x".repeat(5001) },
    ]) {
      expect(await scope.calendar.create(input)).toEqual({ ok: false, reason: "invalid" });
    }
  });
});

describe("imported university events", () => {
  it("cannot be edited or deleted, but keep the user's notes", async () => {
    const { scope } = await createOwner();
    const [lecture] = await scope.calendar.between(
      at("2026-10-06T07:00:00Z"),
      at("2026-10-06T11:00:00Z"),
    );
    if (!lecture) throw new Error("no lecture");

    expect(
      await scope.calendar.update(lecture.id, {
        type: "personal",
        title: "Moved",
        startsAt: lecture.startsAt,
        endsAt: lecture.endsAt,
        allDay: false,
        timezone: ZONE,
      }),
    ).toEqual({ ok: false, reason: "read-only" });
    expect(await scope.calendar.remove(lecture.id)).toEqual({ ok: false, reason: "read-only" });

    const noted = await scope.calendar.setNotes(lecture.id, "  Sit near the front ");
    expect(noted).toMatchObject({
      ok: true,
      event: { notes: "Sit near the front", title: lecture.title },
    });
  });
});

describe("course exams", () => {
  it("are added by hand, edited and deleted", async () => {
    const { scope, course } = await createOwner();
    const added = await scope.calendar.exams.add({
      courseId: course("pharmacology").id,
      kind: "final",
      startsAt: at("2027-01-20T08:00:00Z"),
      endsAt: at("2027-01-20T10:00:00Z"),
      timezone: ZONE,
      location: "Sigma",
    });
    if (!added.ok) throw new Error(added.reason);
    expect(added.event).toMatchObject({
      type: "exam",
      origin: "university",
      imported: false,
      title: "Pharmacology I — Final exam",
      exam: { kind: "final" },
      course: { slug: "pharmacology" },
    });

    const moved = await scope.calendar.exams.update(added.event.id, {
      courseId: course("pathology").id,
      kind: "midterm",
      title: "Pathology midterm",
      startsAt: at("2026-11-13T08:00:00Z"),
      endsAt: at("2026-11-13T09:30:00Z"),
      timezone: ZONE,
    });
    expect(moved).toMatchObject({
      ok: true,
      event: { type: "midterm", title: "Pathology midterm", course: { slug: "pathology" } },
    });
    const [exam] = await db
      .select()
      .from(examEvents)
      .where(eq(examEvents.calendarEventId, added.event.id));
    expect(exam).toMatchObject({ kind: "midterm", courseId: course("pathology").id });

    expect(
      (await scope.calendar.exams.upcoming(at("2026-10-01T00:00:00Z"))).map((e) => e.id),
    ).toEqual([added.event.id]);
    // An exam is changed through its own form, not as an ordinary event.
    expect(
      await scope.calendar.update(added.event.id, {
        type: "personal",
        title: "x",
        startsAt: at("2026-11-13T08:00:00Z"),
        endsAt: at("2026-11-13T09:00:00Z"),
        allDay: false,
        timezone: ZONE,
      }),
    ).toEqual({ ok: false, reason: "invalid" });

    expect(await scope.calendar.remove(added.event.id)).toEqual({ ok: true });
    expect(
      await db.select().from(examEvents).where(eq(examEvents.calendarEventId, added.event.id)),
    ).toEqual([]);
  });

  it("need a course of the user's own", async () => {
    const { scope } = await createOwner();
    const other = await createOwner();
    expect(
      await scope.calendar.exams.add({
        courseId: other.course("pathology").id,
        kind: "final",
        startsAt: at("2027-01-20T08:00:00Z"),
        endsAt: at("2027-01-20T10:00:00Z"),
        timezone: ZONE,
      }),
    ).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("privacy and study sessions", () => {
  it("treats another user's event as missing", async () => {
    const mine = await createOwner();
    const theirs = await createOwner();
    const created = await theirs.scope.calendar.create({
      type: "personal",
      title: "Private",
      startsAt: at("2026-10-10T08:00:00Z"),
      endsAt: at("2026-10-10T09:00:00Z"),
      allDay: false,
      timezone: ZONE,
    });
    if (!created.ok) throw new Error(created.reason);
    const id = created.event.id;

    expect(await mine.scope.calendar.get(id)).toBeNull();
    expect(await mine.scope.calendar.setNotes(id, "x")).toEqual({ ok: false, reason: "not-found" });
    expect(await mine.scope.calendar.remove(id)).toEqual({ ok: false, reason: "not-found" });
    const window = await mine.scope.calendar.between(
      at("2026-10-10T00:00:00Z"),
      at("2026-10-11T00:00:00Z"),
    );
    expect(window.map((event) => event.id)).not.toContain(id);
  });

  it("lists finished timed study in the window", async () => {
    const { scope, course } = await createOwner();
    const started = await scope.studySessions.start(
      { activity: "revision", courseId: course("pathology").id },
      at("2026-10-10T08:00:00Z"),
    );
    if (!started.ok) throw new Error("not started");
    await scope.studySessions.finish(started.session.id, at("2026-10-10T08:05:00Z"));
    await scope.studySessions.start({ activity: "other" }, at("2026-10-10T09:00:00Z"));

    const studied = await scope.calendar.studiedBetween(
      at("2026-10-10T00:00:00Z"),
      at("2026-10-11T00:00:00Z"),
    );
    expect(studied).toEqual([
      expect.objectContaining({
        id: started.session.id,
        activity: "revision",
        activeSeconds: 300,
        course: expect.objectContaining({ slug: "pathology" }),
      }),
    ]);
  });
});
