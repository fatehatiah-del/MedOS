import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database, DatabaseConnection } from "../client";
import { lectures, resources, weeks } from "../schema";
import { ensureWorkspace } from "../seed/workspace";
import { createUser, first } from "../test-support";
import { createTestDatabase } from "../testing";

import { type UserScope, createUserScope } from "./user-scope";

/*
 * The academic hierarchy as the application reads it: Semester → Course →
 * Week → 0..n Lectures, with completion that belongs to one user and changes
 * only when that user says so.
 */

let connection: DatabaseConnection;
let db: Database;

/** A user with the six courses and the fixture weeks (1, 1, 0 and 2 lectures). */
async function createStudent() {
  const user = await createUser(db);
  const semester = await ensureWorkspace(db, user.id, { fixtureLectures: true });
  const scope = createUserScope(db, user.id);
  return { user, semester, scope };
}

async function courseBySlug(scope: UserScope, semesterId: string, slug: string) {
  const course = await scope.courses.getBySlug(semesterId, slug);
  if (!course) throw new Error(`expected course ${slug}`);
  return course;
}

async function outlineOf(scope: UserScope, courseId: string) {
  const outline = await scope.courses.outline(courseId);
  if (!outline) throw new Error("expected an outline");
  return outline;
}

beforeAll(async () => {
  connection = await createTestDatabase();
  db = connection.db;
});

afterAll(async () => {
  await connection.close();
});

describe("courses", () => {
  it("lists the six courses of the semester, distinct and in order", async () => {
    const { scope, semester } = await createStudent();
    const overview = await scope.courses.overview(semester.id);

    expect(overview.map(({ course }) => course.name)).toEqual([
      "Pathology I",
      "Pathophysiology I",
      "Medical Microbiology I",
      "Pharmacology I",
      "Public & Global Health",
      "Communication Skills",
    ]);
    expect(new Set(overview.map(({ course }) => course.id)).size).toBe(6);
  });

  it("keeps Public & Global Health and Communication Skills as separate courses", async () => {
    const { scope, semester } = await createStudent();
    const publicHealth = await courseBySlug(scope, semester.id, "public-health");
    const communication = await courseBySlug(scope, semester.id, "communication-skills");

    expect(publicHealth.id).not.toBe(communication.id);
    // Each has its own weeks and lectures; nothing is shared between them.
    const publicHealthLectures = (await outlineOf(scope, publicHealth.id)).flatMap(
      (week) => week.lectures,
    );
    const communicationLectures = (await outlineOf(scope, communication.id)).flatMap(
      (week) => week.lectures,
    );
    const shared = publicHealthLectures.filter((lecture) =>
      communicationLectures.some((other) => other.id === lecture.id),
    );
    expect(publicHealthLectures).toHaveLength(4);
    expect(shared).toEqual([]);
  });

  it("finds a course by slug only within the user's own semester", async () => {
    const { scope, semester } = await createStudent();

    expect((await scope.courses.getBySlug(semester.id, "pharmacology"))?.name).toBe(
      "Pharmacology I",
    );
    expect(await scope.courses.getBySlug(semester.id, "anatomy")).toBeNull();
    expect(await scope.courses.getBySlug(semester.id, "Pharmacology I")).toBeNull();
    expect(await scope.courses.getBySlug("not-a-uuid", "pharmacology")).toBeNull();
  });
});

describe("weeks and lectures", () => {
  it("shows weeks in order, holding one, no and several lectures", async () => {
    const { scope, semester } = await createStudent();
    const course = await courseBySlug(scope, semester.id, "pharmacology");

    const outline = await outlineOf(scope, course.id);

    expect(outline.map((week) => [week.number, week.lectures.length])).toEqual([
      [1, 1],
      [2, 1],
      [3, 0],
      [4, 2],
    ]);
    // The empty week is still a week, with its dates.
    expect(outline[2]).toMatchObject({ number: 3, startsOn: "2026-10-12", lectures: [] });
    // Week 4 has two lectures, numbered within the week, not by week number.
    expect(outline[3]?.lectures.map((lecture) => lecture.number)).toEqual([1, 2]);
  });

  it("orders weeks and lectures by number, whatever order they were created in", async () => {
    const user = await createUser(db);
    const semester = await ensureWorkspace(db, user.id);
    const scope = createUserScope(db, user.id);
    const course = await courseBySlug(scope, semester.id, "pathology");
    const owned = { userId: user.id, courseId: course.id };

    const [late, early] = await db
      .insert(weeks)
      .values([
        { ...owned, number: 7 },
        { ...owned, number: 2 },
      ])
      .returning();
    if (!late || !early) throw new Error("expected two weeks");
    await db.insert(lectures).values(
      [3, 1, 2].map((number) => ({
        ...owned,
        weekId: late.id,
        number,
        title: `Lecture created out of order ${number}`,
      })),
    );

    const outline = await outlineOf(scope, course.id);

    expect(outline.map((week) => week.number)).toEqual([2, 7]);
    expect(outline[1]?.lectures.map((lecture) => lecture.number)).toEqual([1, 2, 3]);
    // Stable: asking again gives the same order.
    expect(await outlineOf(scope, course.id)).toEqual(outline);
  });

  it("ties every lecture to its own week and course", async () => {
    const { scope, semester } = await createStudent();
    const course = await courseBySlug(scope, semester.id, "microbiology");
    const outline = await outlineOf(scope, course.id);
    const second = outline[3]?.lectures[1];
    if (!second) throw new Error("expected week 4, lecture 2");

    const detail = await scope.lectures.detail(second.id);

    expect(detail?.course.id).toBe(course.id);
    expect(detail?.week.number).toBe(4);
    expect(detail?.lecture.number).toBe(2);
    expect(detail?.weekLectures.map((lecture) => lecture.number)).toEqual([1, 2]);
    expect(detail?.completedAt).toBeNull();
    expect(detail?.resources).toEqual([]);
  });

  it("reports the kinds of material a lecture has, once each", async () => {
    const { user, scope, semester } = await createStudent();
    const course = await courseBySlug(scope, semester.id, "pharmacology");
    const lecture = (await outlineOf(scope, course.id))[0]?.lectures[0];
    if (!lecture) throw new Error("expected a lecture");
    const file = { userId: user.id, lectureId: lecture.id, mimeType: "text/plain", sizeBytes: 1 };
    await db.insert(resources).values([
      { ...file, kind: "study-guide", originalFilename: "a.docx", contentHash: "1".repeat(64) },
      { ...file, kind: "study-guide", originalFilename: "b.docx", contentHash: "2".repeat(64) },
      { ...file, kind: "mcq", originalFilename: "quiz.html", contentHash: "3".repeat(64) },
    ]);

    const outlined = (await outlineOf(scope, course.id))[0]?.lectures[0];
    const detail = await scope.lectures.detail(lecture.id);

    expect([...(outlined?.resourceKinds ?? [])].sort()).toEqual(["mcq", "study-guide"]);
    expect(detail?.resources).toHaveLength(3);
    expect(detail?.resources[0]).not.toHaveProperty("storageKey");
  });

  it("says whether the user's lectures include development placeholders", async () => {
    const withFixtures = await createStudent();
    const user = await createUser(db);
    await ensureWorkspace(db, user.id);
    const withoutFixtures = createUserScope(db, user.id);

    expect(await withFixtures.scope.lectures.includesFixtures()).toBe(true);
    expect(await withoutFixtures.lectures.includesFixtures()).toBe(false);
  });

  it("handles a course with no weeks and unknown identifiers quietly", async () => {
    const user = await createUser(db);
    const semester = await ensureWorkspace(db, user.id);
    const scope = createUserScope(db, user.id);
    const course = await courseBySlug(scope, semester.id, "pathology");
    const missing = "00000000-0000-4000-8000-000000000000";

    expect(await scope.courses.outline(course.id)).toEqual([]);
    expect(await scope.courses.outline(missing)).toBeNull();
    expect(await scope.courses.outline("week-4")).toBeNull();
    expect(await scope.lectures.detail(missing)).toBeNull();
    expect(await scope.lectures.detail("lecture-2")).toBeNull();
  });
});

describe("completion and progress", () => {
  it("starts with nothing complete", async () => {
    const { scope, semester } = await createStudent();
    const overview = await scope.courses.overview(semester.id);

    for (const entry of overview) {
      expect(entry).toMatchObject({
        weekCount: 4,
        lectureCount: 4,
        completedLectureCount: 0,
        latestWeekWithLectures: 4,
      });
    }
  });

  it("counts lectures, not weeks: the empty week adds nothing", async () => {
    const { scope, semester } = await createStudent();
    const [entry] = await scope.courses.overview(semester.id);

    // Four weeks, one of them empty, and week 4 has two lectures: 1 + 1 + 0 + 2.
    expect(entry?.weekCount).toBe(4);
    expect(entry?.lectureCount).toBe(4);
  });

  it("changes only when the user marks a lecture, and can be reversed", async () => {
    const { scope, semester } = await createStudent();
    const course = await courseBySlug(scope, semester.id, "pharmacology");
    const lecture = (await outlineOf(scope, course.id))[3]?.lectures[0];
    if (!lecture) throw new Error("expected week 4, lecture 1");
    const completedFor = async (slug: string) =>
      (await scope.courses.overview(semester.id)).find(({ course: c }) => c.slug === slug)
        ?.completedLectureCount;

    // Reading the course and the lecture does not complete anything.
    await scope.lectures.detail(lecture.id);
    await scope.courses.outline(course.id);
    expect(await completedFor("pharmacology")).toBe(0);

    const at = new Date("2026-10-21T18:00:00Z");
    await scope.lectures.setCompleted(lecture.id, true, at);

    expect(await completedFor("pharmacology")).toBe(1);
    expect(await completedFor("pathology")).toBe(0);
    const week4 = (await outlineOf(scope, course.id))[3];
    expect(week4?.lectures.map((entry) => entry.completedAt)).toEqual([at, null]);
    expect((await scope.lectures.detail(lecture.id))?.completedAt).toEqual(at);

    await scope.lectures.setCompleted(lecture.id, false);

    expect(await completedFor("pharmacology")).toBe(0);
    expect((await scope.lectures.detail(lecture.id))?.completedAt).toBeNull();
  });

  it("is not changed by attaching material to a lecture", async () => {
    const { user, scope, semester } = await createStudent();
    const course = await courseBySlug(scope, semester.id, "pharmacology");
    const lecture = (await outlineOf(scope, course.id))[0]?.lectures[0];
    if (!lecture) throw new Error("expected a lecture");

    await db.insert(resources).values({
      userId: user.id,
      lectureId: lecture.id,
      kind: "study-guide",
      originalFilename: "StudyGuide.docx",
      mimeType: "text/plain",
      sizeBytes: 1,
      contentHash: "4".repeat(64),
    });

    expect((await scope.lectures.detail(lecture.id))?.completedAt).toBeNull();
    expect((await scope.courses.overview(semester.id))[3]?.completedLectureCount).toBe(0);
  });

  it("belongs to one user: another user's identical course is unaffected", async () => {
    const alice = await createStudent();
    const bob = await createStudent();
    const aliceCourse = await courseBySlug(alice.scope, alice.semester.id, "pharmacology");
    const bobCourse = await courseBySlug(bob.scope, bob.semester.id, "pharmacology");
    const aliceLecture = first((await outlineOf(alice.scope, aliceCourse.id))[0]?.lectures ?? []);

    await alice.scope.lectures.setCompleted(aliceLecture.id, true);

    const aliceProgress = (await alice.scope.courses.overview(alice.semester.id))[3];
    const bobProgress = (await bob.scope.courses.overview(bob.semester.id))[3];
    expect(aliceProgress?.completedLectureCount).toBe(1);
    expect(bobProgress?.completedLectureCount).toBe(0);
    const bobLectures = (await outlineOf(bob.scope, bobCourse.id)).flatMap((week) => week.lectures);
    expect(bobLectures.every((lecture) => lecture.completedAt === null)).toBe(true);

    // Bob can neither see nor change Alice's lecture.
    expect(await bob.scope.lectures.detail(aliceLecture.id)).toBeNull();
    expect(await bob.scope.lectures.setCompleted(aliceLecture.id, false)).toBeNull();
    expect((await alice.scope.lectures.detail(aliceLecture.id))?.completedAt).not.toBeNull();
  });
});
