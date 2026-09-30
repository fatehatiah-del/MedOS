import { COURSES, FALL_2026 } from "@medos/shared";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DatabaseConnection } from "../client";
import { courses, lectures, semesters, users, weeks } from "../schema";
import { createUser } from "../test-support";
import { createTestDatabase } from "../testing";

import {
  DEVELOPMENT_USER,
  fixtureLectureTitle,
  isFixtureLecture,
  seedDevelopment,
} from "./development";
import { seedSemester } from "./semester";
import { ensureWorkspace } from "./workspace";

let connection: DatabaseConnection;

beforeAll(async () => {
  connection = await createTestDatabase();
});

afterAll(async () => {
  await connection.close();
});

async function snapshot() {
  const { db } = connection;
  return {
    users: await db.select().from(users).orderBy(asc(users.email)),
    semesters: await db.select().from(semesters).orderBy(asc(semesters.slug)),
    courses: await db.select().from(courses).orderBy(asc(courses.position)),
    weeks: await db.select().from(weeks).orderBy(asc(weeks.id)),
    lectures: await db.select().from(lectures).orderBy(asc(lectures.id)),
  };
}

describe("development seed", () => {
  it("creates the placeholder user, the Fall 2026 semester and six separate courses", async () => {
    const result = await seedDevelopment(connection.db);

    expect(result.user.email).toBe(DEVELOPMENT_USER.email);
    expect(result.user.emailVerified).toBe(false);

    expect(result.semester).toMatchObject({
      slug: "2026-fall",
      name: "Fall 2026",
      label: "Semester 5",
      academicYear: "Year 3",
      studentGroup: "A",
      startsOn: "2026-09-28",
      endsOn: "2027-01-29",
      midtermsStartOn: "2026-11-12",
      midtermsEndOn: "2026-11-18",
      finalsStartOn: "2027-01-18",
      finalsEndOn: "2027-01-29",
    });

    expect(result.courses.map((course) => course.name)).toEqual([
      "Pathology I",
      "Pathophysiology I",
      "Medical Microbiology I",
      "Pharmacology I",
      "Public & Global Health",
      "Communication Skills",
    ]);
    expect(new Set(result.courses.map((course) => course.id)).size).toBe(6);
    expect(new Set(result.courses.map((course) => course.slug)).size).toBe(6);
  });

  it("keeps Public & Global Health and Communication Skills as two courses", async () => {
    const rows = await connection.db.select().from(courses);
    const publicHealth = rows.find((course) => course.slug === "public-health");
    const communication = rows.find((course) => course.slug === "communication-skills");

    expect(publicHealth?.name).toBe("Public & Global Health");
    expect(communication?.name).toBe("Communication Skills");
    expect(publicHealth?.id).not.toBe(communication?.id);
  });

  it("gives every course weeks with one lecture, two lectures and no lectures", async () => {
    const seeded = await connection.db.query.courses.findMany({
      orderBy: asc(courses.position),
      with: { weeks: { with: { lectures: true }, orderBy: asc(weeks.number) } },
    });

    expect(seeded).toHaveLength(6);
    for (const course of seeded) {
      expect(
        course.weeks.map((week) => [week.number, week.lectures.length]),
        course.slug,
      ).toEqual([
        [1, 1],
        [2, 1],
        [3, 0],
        [4, 2],
      ]);
    }
  });

  it("dates each fixture week from the start of term", async () => {
    const pharmacology = await connection.db.query.courses.findFirst({
      where: eq(courses.slug, "pharmacology"),
      with: { weeks: { orderBy: asc(weeks.number) } },
    });

    expect(pharmacology?.weeks.map((week) => [week.startsOn, week.endsOn])).toEqual([
      ["2026-09-28", "2026-10-04"],
      ["2026-10-05", "2026-10-11"],
      ["2026-10-12", "2026-10-18"],
      ["2026-10-19", "2026-10-25"],
    ]);
  });

  it("marks fixture lectures as development data and completes none of them", async () => {
    const rows = await connection.db.query.lectures.findMany({ with: { progress: true } });
    expect(rows).toHaveLength(24);
    for (const lecture of rows) {
      expect(isFixtureLecture(lecture)).toBe(true);
      expect(lecture.title).toContain("development data");
      expect(lecture.progress).toBeNull();
    }
  });

  it("never overwrites a lecture that already occupies a fixture position", async () => {
    const [existing] = await connection.db.select().from(lectures).limit(1);
    if (!existing) throw new Error("expected a seeded lecture");
    await connection.db
      .update(lectures)
      .set({ title: "A real lecture title" })
      .where(eq(lectures.id, existing.id));

    await seedDevelopment(connection.db);

    const [after] = await connection.db.select().from(lectures).where(eq(lectures.id, existing.id));
    expect(after?.title).toBe("A real lecture title");

    // Put it back so the following tests see the pristine fixture set.
    await connection.db
      .update(lectures)
      .set({ title: fixtureLectureTitle(1, 1) })
      .where(eq(lectures.id, existing.id));
  });

  it("is idempotent: a second run changes nothing", async () => {
    const before = await snapshot();

    await seedDevelopment(connection.db);
    await seedDevelopment(connection.db);

    const after = await snapshot();
    expect(after).toEqual(before);
    expect(after.courses).toHaveLength(6);
  });

  it("restores seeded values that were changed", async () => {
    await connection.db
      .update(courses)
      .set({ name: "Renamed" })
      .where(eq(courses.slug, "pathology"));

    const result = await seedDevelopment(connection.db);

    expect(result.courses.find((course) => course.slug === "pathology")?.name).toBe("Pathology I");
    expect(await connection.db.select().from(courses)).toHaveLength(6);
  });
});

describe("seedSemester", () => {
  it("seeds the same semester independently for another user", async () => {
    const other = await createUser(connection.db);

    const seeded = await seedSemester(connection.db, other.id);

    expect(seeded.semester.userId).toBe(other.id);
    expect(seeded.semester.slug).toBe(FALL_2026.id);
    expect(seeded.courses).toHaveLength(COURSES.length);
    expect(seeded.courses.every((course) => course.userId === other.id)).toBe(true);
    // Two users now each have their own six courses.
    expect(await connection.db.select().from(courses)).toHaveLength(12);
  });
});

describe("ensureWorkspace", () => {
  const ownedBy = (userId: string) => ({
    semesters: () => connection.db.select().from(semesters).where(eq(semesters.userId, userId)),
    courses: () => connection.db.select().from(courses).where(eq(courses.userId, userId)),
    weeks: () => connection.db.select().from(weeks).where(eq(weeks.userId, userId)),
    lectures: () => connection.db.select().from(lectures).where(eq(lectures.userId, userId)),
  });

  it("gives a new account its semester and six courses, and no lectures", async () => {
    const user = await createUser(connection.db);
    const owned = ownedBy(user.id);

    const semester = await ensureWorkspace(connection.db, user.id);

    expect(semester).toMatchObject({ userId: user.id, slug: FALL_2026.id });
    expect(await owned.courses()).toHaveLength(6);
    // Nothing is invented: without the development option there are no weeks or lectures.
    expect(await owned.weeks()).toHaveLength(0);
    expect(await owned.lectures()).toHaveLength(0);
  });

  it("changes nothing when the workspace already exists", async () => {
    const user = await createUser(connection.db);
    const owned = ownedBy(user.id);
    const first = await ensureWorkspace(connection.db, user.id);
    const coursesBefore = await owned.courses();

    const second = await ensureWorkspace(connection.db, user.id);

    expect(second).toEqual(first);
    expect(await owned.semesters()).toHaveLength(1);
    expect(await owned.courses()).toEqual(coursesBefore);
  });

  it("adds fixture lectures only when asked, and only once", async () => {
    const user = await createUser(connection.db);
    const owned = ownedBy(user.id);

    await ensureWorkspace(connection.db, user.id, { fixtureLectures: true });
    const lecturesBefore = await owned.lectures();
    expect(await owned.weeks()).toHaveLength(24);
    expect(lecturesBefore).toHaveLength(24);

    await ensureWorkspace(connection.db, user.id, { fixtureLectures: true });
    expect(await owned.lectures()).toEqual(lecturesBefore);
  });

  it("leaves an account that already has weeks alone", async () => {
    const user = await createUser(connection.db);
    const owned = ownedBy(user.id);
    await ensureWorkspace(connection.db, user.id);
    const [course] = await owned.courses();
    if (!course) throw new Error("expected a course");
    await connection.db.insert(weeks).values({ userId: user.id, courseId: course.id, number: 1 });

    await ensureWorkspace(connection.db, user.id, { fixtureLectures: true });

    // Real structure exists, so no fixtures are mixed into it.
    expect(await owned.weeks()).toHaveLength(1);
    expect(await owned.lectures()).toHaveLength(0);
  });

  it("is safe when two first requests arrive together", async () => {
    const user = await createUser(connection.db);
    const owned = ownedBy(user.id);

    await Promise.all([
      ensureWorkspace(connection.db, user.id),
      ensureWorkspace(connection.db, user.id),
    ]);

    expect(await owned.semesters()).toHaveLength(1);
    expect(await owned.courses()).toHaveLength(6);
  });
});
