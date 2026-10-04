// @vitest-environment node
import {
  type Database,
  type DatabaseConnection,
  courses,
  createUserScope,
  lectures,
  semesters,
  users,
  weeks,
} from "@medos/database";
import { createTestDatabase } from "@medos/database/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MESSAGES, commandTimer, deleteSession, pauseTimer, startTimer } from "./logic";

/* The study timer's actions as the browser calls them: untrusted input, the user's scope. */

let connection: DatabaseConnection;
let db: Database;
let sequence = 0;

const T0 = new Date("2026-10-05T09:00:00Z").getTime();
const at = (seconds: number) => new Date(T0 + seconds * 1000);

async function createOwner() {
  sequence += 1;
  const [user] = await db
    .insert(users)
    .values({ email: `timer-${sequence}@example.test`, displayName: "Timer" })
    .returning();
  if (!user) throw new Error("no user");
  const [semester] = await db
    .insert(semesters)
    .values({
      userId: user.id,
      slug: "2026-fall",
      name: "Fall 2026",
      label: "Semester 5",
      startsOn: "2026-09-28",
      endsOn: "2027-01-29",
    })
    .returning();
  if (!semester) throw new Error("no semester");
  const [course] = await db
    .insert(courses)
    .values({
      userId: user.id,
      semesterId: semester.id,
      slug: "pharmacology",
      name: "Pharmacology I",
      shortName: "Pharma",
    })
    .returning();
  if (!course) throw new Error("no course");
  const [week] = await db
    .insert(weeks)
    .values({ userId: user.id, courseId: course.id, number: 1 })
    .returning();
  if (!week) throw new Error("no week");
  const [lecture] = await db
    .insert(lectures)
    .values({
      userId: user.id,
      courseId: course.id,
      weekId: week.id,
      number: 1,
      title: "Receptors",
    })
    .returning();
  if (!lecture) throw new Error("no lecture");
  return { scope: createUserScope(db, user.id), course, lecture };
}

beforeAll(async () => {
  connection = await createTestDatabase();
  db = connection.db;
});

afterAll(async () => {
  await connection.close();
});

describe("startTimer", () => {
  it("starts a timer for a lecture and reports one already open", async () => {
    const { scope, course, lecture } = await createOwner();

    const first = await startTimer(scope, { activity: "mcq", lectureId: lecture.id }, at(0));
    expect(first).toMatchObject({
      ok: true,
      value: { started: true, session: { course: { id: course.id }, state: "running" } },
    });

    const second = await startTimer(scope, { activity: "flashcards", courseId: course.id }, at(30));
    expect(second).toMatchObject({
      ok: true,
      value: { started: false, open: { activity: "mcq", activeSeconds: 30 } },
    });
  });

  it("rejects malformed input and lectures that are not the user's", async () => {
    const { scope } = await createOwner();
    const other = await createOwner();

    expect(await startTimer(scope, { activity: "sleep" })).toEqual({
      ok: false,
      error: MESSAGES.invalid,
    });
    expect(await startTimer(scope, { activity: "mcq", lectureId: "not-a-uuid" })).toEqual({
      ok: false,
      error: MESSAGES.invalid,
    });
    expect(await startTimer(scope, { activity: "mcq", lectureId: other.lecture.id })).toEqual({
      ok: false,
      error: MESSAGES.notFound,
    });
  });
});

describe("pauseTimer", () => {
  it("backdates an automatic pause by the idle time the browser reports", async () => {
    const { scope } = await createOwner();
    const started = await startTimer(scope, { activity: "study-guide" }, at(0));
    if (!started.ok || !started.value.started) throw new Error("not started");
    const sessionId = started.value.session.id;
    await commandTimer(scope, "heartbeat", { sessionId }, at(60));

    const paused = await pauseTimer(
      scope,
      { sessionId, reason: "idle", idleForMs: 300_000 },
      at(360),
    );
    expect(paused).toMatchObject({
      ok: true,
      value: { state: "paused", pausedReason: "idle", activeSeconds: 60 },
    });
  });

  it("refuses an unknown reason or an absurd idle period", async () => {
    const { scope } = await createOwner();
    const started = await startTimer(scope, { activity: "revision" }, at(0));
    if (!started.ok || !started.value.started) throw new Error("not started");
    const sessionId = started.value.session.id;

    for (const input of [
      { sessionId, reason: "bored" },
      { sessionId, reason: "idle", idleForMs: -1 },
      { sessionId, reason: "idle", idleForMs: 1e12 },
    ]) {
      expect(await pauseTimer(scope, input, at(10))).toEqual({
        ok: false,
        error: MESSAGES.invalid,
      });
    }
  });
});

describe("commandTimer and deleteSession", () => {
  it("resumes and finishes, excluding the paused time", async () => {
    const { scope } = await createOwner();
    const started = await startTimer(scope, { activity: "question-bank" }, at(0));
    if (!started.ok || !started.value.started) throw new Error("not started");
    const sessionId = started.value.session.id;

    await pauseTimer(scope, { sessionId, reason: "manual" }, at(120));
    await commandTimer(scope, "resume", { sessionId }, at(1000));
    const finished = await commandTimer(scope, "finish", { sessionId }, at(1060));
    expect(finished).toMatchObject({ ok: true, value: { state: "finished", activeSeconds: 180 } });
  });

  it("says when the session is not the user's, and deletes only their own", async () => {
    const mine = await createOwner();
    const theirs = await createOwner();
    const started = await startTimer(theirs.scope, { activity: "other" }, at(0));
    if (!started.ok || !started.value.started) throw new Error("not started");
    const sessionId = started.value.session.id;

    expect(await commandTimer(mine.scope, "finish", { sessionId })).toEqual({
      ok: false,
      error: MESSAGES.gone,
    });
    expect(await deleteSession(mine.scope, { sessionId })).toEqual({
      ok: false,
      error: MESSAGES.sessionMissing,
    });
    expect(await deleteSession(theirs.scope, { sessionId })).toEqual({
      ok: true,
      value: undefined,
    });
  });
});
