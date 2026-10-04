import { STUDY_TIMER } from "@medos/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database, DatabaseConnection } from "../client";
import { lectureProgress, studySessions } from "../schema";
import {
  createCourse,
  createCourseForNewUser,
  createLecture,
  createWeek,
  violation,
} from "../test-support";
import { createTestDatabase } from "../testing";

import { createUserScope } from "./user-scope";

/*
 * The study timer at the trusted boundary: paused time is never counted, a
 * session survives a reload, there is never more than one open timer, a
 * browser that went away is counted only up to the last moment the user was
 * seen, and nothing touches lecture completion.
 */

let connection: DatabaseConnection;
let db: Database;

const T0 = new Date("2026-10-05T09:00:00Z").getTime();
/** The instant `seconds` after T0. */
const at = (seconds: number) => new Date(T0 + seconds * 1000);

async function createOwner() {
  const { user, semester, course } = await createCourseForNewUser(db);
  const lecture = await createLecture(db, await createWeek(db, course, 1), 1);
  return { user, semester, course, lecture, scope: createUserScope(db, user.id) };
}

beforeAll(async () => {
  connection = await createTestDatabase();
  db = connection.db;
});

afterAll(async () => {
  await connection.close();
});

describe("starting a timer", () => {
  it("runs with the lecture's course and the chosen activity", async () => {
    const { course, lecture, scope } = await createOwner();

    const result = await scope.studySessions.start(
      { activity: "study-guide", lectureId: lecture.id },
      at(0),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session).toMatchObject({
      activity: "study-guide",
      state: "running",
      activeSeconds: 0,
      course: { id: course.id },
      lecture: { id: lecture.id },
      startedAt: at(0),
      endedAt: null,
    });
  });

  it("allows a course on its own, or no context at all", async () => {
    const { course, scope } = await createOwner();

    const byCourse = await scope.studySessions.start({ activity: "revision", courseId: course.id });
    expect(byCourse.ok && byCourse.session.lecture).toBeNull();
    if (byCourse.ok) await scope.studySessions.finish(byCourse.session.id);

    const free = await scope.studySessions.start({ activity: "other" });
    expect(free.ok && free.session.course).toBeNull();
  });

  it("refuses unknown activities, foreign lectures and a course that does not match", async () => {
    const { semester, lecture, scope } = await createOwner();
    const other = await createOwner();
    const otherCourse = await createCourse(db, semester, "pathology");

    expect(
      await scope.studySessions.start({ activity: "napping" as never, lectureId: lecture.id }),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(
      await scope.studySessions.start({ activity: "mcq", lectureId: other.lecture.id }),
    ).toEqual({ ok: false, reason: "not-found" });
    expect(await scope.studySessions.start({ activity: "mcq", courseId: other.course.id })).toEqual(
      { ok: false, reason: "not-found" },
    );
    expect(
      await scope.studySessions.start({
        activity: "mcq",
        lectureId: lecture.id,
        courseId: otherCourse.id,
      }),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(await scope.studySessions.current()).toBeNull();
  });
});

describe("active time", () => {
  it("excludes paused periods", async () => {
    const { lecture, scope } = await createOwner();
    const started = await scope.studySessions.start(
      { activity: "mcq", lectureId: lecture.id },
      at(0),
    );
    if (!started.ok) throw new Error("not started");
    const id = started.session.id;

    await scope.studySessions.heartbeat(id, at(240));
    const paused = await scope.studySessions.pause(id, { reason: "manual" }, at(300));
    expect(paused).toMatchObject({ state: "paused", pausedReason: "manual", activeSeconds: 300 });

    // An hour away: still 300.
    expect((await scope.studySessions.get(id, at(3900)))?.activeSeconds).toBe(300);

    const resumed = await scope.studySessions.resume(id, at(3900));
    expect(resumed).toMatchObject({ state: "running", pausedReason: null, activeSeconds: 300 });
    expect((await scope.studySessions.get(id, at(4000)))?.activeSeconds).toBe(400);

    const finished = await scope.studySessions.finish(id, at(4100));
    expect(finished).toMatchObject({ state: "finished", activeSeconds: 500, endedAt: at(4100) });
  });

  it("can backdate a pause to when the user went idle, but never before the stretch began", async () => {
    const { scope } = await createOwner();
    const started = await scope.studySessions.start({ activity: "study-guide" }, at(0));
    if (!started.ok) throw new Error("not started");
    const id = started.session.id;

    await scope.studySessions.heartbeat(id, at(120));
    const idle = await scope.studySessions.pause(id, { reason: "idle", at: at(120) }, at(420));
    expect(idle).toMatchObject({ pausedReason: "idle", activeSeconds: 120 });

    await scope.studySessions.resume(id, at(1000));
    const early = await scope.studySessions.pause(id, { reason: "hidden", at: at(500) }, at(1060));
    expect(early?.activeSeconds).toBe(120);

    await scope.studySessions.resume(id, at(2000));
    const future = await scope.studySessions.pause(
      id,
      { reason: "manual", at: at(9999) },
      at(2030),
    );
    expect(future?.activeSeconds).toBe(150);
  });

  it("ends a paused session when it was paused", async () => {
    const { scope } = await createOwner();
    const started = await scope.studySessions.start({ activity: "flashcards" }, at(0));
    if (!started.ok) throw new Error("not started");

    await scope.studySessions.pause(started.session.id, { reason: "manual" }, at(90));
    const finished = await scope.studySessions.finish(started.session.id, at(7200));
    expect(finished).toMatchObject({ activeSeconds: 90, endedAt: at(90) });
  });

  it("changes nothing when pausing, resuming or finishing twice", async () => {
    const { scope } = await createOwner();
    const started = await scope.studySessions.start({ activity: "revision" }, at(0));
    if (!started.ok) throw new Error("not started");
    const id = started.session.id;

    await scope.studySessions.pause(id, { reason: "manual" }, at(60));
    expect(await scope.studySessions.pause(id, { reason: "idle" }, at(120))).toMatchObject({
      pausedReason: "manual",
      activeSeconds: 60,
    });
    await scope.studySessions.resume(id, at(200));
    expect((await scope.studySessions.resume(id, at(230)))?.activeSeconds).toBe(90);
    await scope.studySessions.finish(id, at(260));
    expect(await scope.studySessions.finish(id, at(900))).toMatchObject({
      activeSeconds: 120,
      endedAt: at(260),
    });
    expect(await scope.studySessions.resume(id, at(1000))).toMatchObject({ state: "finished" });
  });
});

describe("reloads and closed browsers", () => {
  it("keeps the open session across a fresh scope, as after a reload", async () => {
    const { user, lecture, scope } = await createOwner();
    const started = await scope.studySessions.start(
      { activity: "question-bank", lectureId: lecture.id },
      at(0),
    );
    if (!started.ok) throw new Error("not started");

    const afterReload = createUserScope(db, user.id);
    expect(await afterReload.studySessions.current(at(30))).toMatchObject({
      id: started.session.id,
      state: "running",
      activeSeconds: 30,
      lecture: { id: lecture.id },
    });
  });

  it("counts a timer whose browser went away only up to the last heartbeat", async () => {
    const { scope } = await createOwner();
    const started = await scope.studySessions.start({ activity: "study-guide" }, at(0));
    if (!started.ok) throw new Error("not started");
    const id = started.session.id;
    await scope.studySessions.heartbeat(id, at(60));

    const stale = at(60 + STUDY_TIMER.staleSeconds + 1);
    expect(await scope.studySessions.current(stale)).toMatchObject({
      state: "interrupted",
      activeSeconds: 60,
    });

    // A heartbeat cannot quietly revive it.
    await scope.studySessions.heartbeat(id, stale);
    expect((await scope.studySessions.get(id, at(5000)))?.state).toBe("interrupted");

    expect(await scope.studySessions.finish(id, at(5000))).toMatchObject({
      state: "finished",
      activeSeconds: 60,
      endedAt: at(60),
    });
  });

  it("resumes an interrupted timer without counting the gap", async () => {
    const { scope } = await createOwner();
    const started = await scope.studySessions.start({ activity: "mcq" }, at(0));
    if (!started.ok) throw new Error("not started");
    const id = started.session.id;
    await scope.studySessions.heartbeat(id, at(100));

    const resumed = await scope.studySessions.resume(id, at(5000));
    expect(resumed).toMatchObject({ state: "running", activeSeconds: 100 });
    expect((await scope.studySessions.finish(id, at(5050)))?.activeSeconds).toBe(150);
  });
});

describe("one timer at a time", () => {
  it("refuses a second start and returns the open session", async () => {
    const { scope } = await createOwner();
    const first = await scope.studySessions.start({ activity: "study-guide" }, at(0));
    if (!first.ok) throw new Error("not started");

    const second = await scope.studySessions.start({ activity: "mcq" }, at(10));
    expect(second).toMatchObject({
      ok: false,
      reason: "already-open",
      open: { id: first.session.id, activeSeconds: 10 },
    });
  });

  it("finishes the open session first when asked to replace it", async () => {
    const { scope } = await createOwner();
    const first = await scope.studySessions.start({ activity: "study-guide" }, at(0));
    if (!first.ok) throw new Error("not started");

    const second = await scope.studySessions.start({ activity: "mcq", replaceOpen: true }, at(45));
    expect(second.ok).toBe(true);
    expect(await scope.studySessions.get(first.session.id, at(100))).toMatchObject({
      state: "finished",
      activeSeconds: 45,
    });
    expect((await scope.studySessions.current(at(100)))?.activity).toBe("mcq");
  });

  it("is enforced by the database", async () => {
    const { user, scope } = await createOwner();
    await scope.studySessions.start({ activity: "revision" });

    expect(
      await violation(() =>
        db
          .insert(studySessions)
          .values({ userId: user.id, activity: "other", startedAt: new Date() }),
      ),
    ).toContain("study_sessions_one_open_idx");
  });

  it("does not stop another user from starting", async () => {
    const one = await createOwner();
    const two = await createOwner();
    await one.scope.studySessions.start({ activity: "revision" });
    expect((await two.scope.studySessions.start({ activity: "revision" })).ok).toBe(true);
  });
});

describe("study time totals", () => {
  it("adds up finished and running time by lecture, course, activity and period", async () => {
    const { course, lecture, scope } = await createOwner();
    const s = scope.studySessions;

    const a = await s.start({ activity: "study-guide", lectureId: lecture.id }, at(0));
    if (a.ok) {
      await s.heartbeat(a.session.id, at(300));
      await s.finish(a.session.id, at(600));
    }
    const b = await s.start({ activity: "mcq", lectureId: lecture.id }, at(1000));
    if (b.ok) await s.finish(b.session.id, at(1300));
    const c = await s.start({ activity: "revision", courseId: course.id }, at(2000));
    if (c.ok) await s.finish(c.session.id, at(2100));
    // Yesterday, outside the period below.
    const d = await s.start({ activity: "mcq", lectureId: lecture.id }, at(-86_400));
    if (d.ok) await s.finish(d.session.id, at(-86_000));
    // Running now, 50 seconds in.
    await s.start({ activity: "study-guide", lectureId: lecture.id }, at(3000));

    expect(
      await s.summary({ lectureId: lecture.id, from: at(0), to: at(86_400) }, at(3050)),
    ).toEqual({
      totalSeconds: 950,
      sessionCount: 3,
      byActivity: { "study-guide": 650, mcq: 300 },
    });
    expect((await s.summary({ courseId: course.id }, at(3050))).totalSeconds).toBe(1450);
    expect(await s.summary({ from: at(0), to: at(86_400) }, at(3050))).toMatchObject({
      totalSeconds: 1050,
      sessionCount: 4,
    });
  });

  it("lists finished sessions, newest first", async () => {
    const { lecture, scope } = await createOwner();
    const s = scope.studySessions;
    for (const [start, end] of [
      [0, 60],
      [100, 200],
    ] as const) {
      const started = await s.start({ activity: "mcq", lectureId: lecture.id }, at(start));
      if (started.ok) await s.finish(started.session.id, at(end));
    }
    await s.start({ activity: "mcq", lectureId: lecture.id }, at(300));

    const recent = await s.recent({ lectureId: lecture.id });
    expect(recent.map((session) => session.activeSeconds)).toEqual([100, 60]);
    expect(recent.every((session) => session.state === "finished")).toBe(true);
  });
});

describe("privacy and deletion", () => {
  it("treats another user's session as missing", async () => {
    const mine = await createOwner();
    const theirs = await createOwner();
    const started = await theirs.scope.studySessions.start({ activity: "revision" }, at(0));
    if (!started.ok) throw new Error("not started");
    const id = started.session.id;

    expect(await mine.scope.studySessions.get(id)).toBeNull();
    expect(await mine.scope.studySessions.pause(id, { reason: "manual" }, at(10))).toBeNull();
    expect(await mine.scope.studySessions.finish(id, at(10))).toBeNull();
    expect(await mine.scope.studySessions.delete(id)).toBe(false);
    expect(await mine.scope.studySessions.current()).toBeNull();
    expect((await mine.scope.studySessions.summary()).sessionCount).toBe(0);
    expect((await theirs.scope.studySessions.get(id, at(10)))?.state).toBe("running");
  });

  it("discards an open timer and deletes a finished session", async () => {
    const { scope } = await createOwner();
    const s = scope.studySessions;
    const finished = await s.start({ activity: "mcq" }, at(0));
    if (!finished.ok) throw new Error("not started");
    await s.finish(finished.session.id, at(60));
    const open = await s.start({ activity: "mcq" }, at(100));
    if (!open.ok) throw new Error("not started");

    expect(await s.delete(open.session.id)).toBe(true);
    expect(await s.current()).toBeNull();
    expect(await s.delete(finished.session.id)).toBe(true);
    expect((await s.summary()).sessionCount).toBe(0);
    expect(await s.delete("not-an-id")).toBe(false);
  });

  it("never marks a lecture complete", async () => {
    const { lecture, scope } = await createOwner();
    const started = await scope.studySessions.start(
      { activity: "study-guide", lectureId: lecture.id },
      at(0),
    );
    if (started.ok) await scope.studySessions.finish(started.session.id, at(3600));

    const progress = await db
      .select()
      .from(lectureProgress)
      .where(eq(lectureProgress.lectureId, lecture.id));
    expect(progress).toEqual([]);
  });
});
