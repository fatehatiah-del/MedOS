import { COURSES, FALL_2026 } from "@medos/shared";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DatabaseConnection } from "../client";
import { courses, lectures, semesters, users, weeks } from "../schema";
import { createUser } from "../test-support";
import { createTestDatabase } from "../testing";

import { DEVELOPMENT_USER, seedDevelopment } from "./development";
import { seedSemester } from "./semester";

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
    weeks: await db.select().from(weeks).orderBy(asc(weeks.number)),
    lectures: await db.select().from(lectures).orderBy(asc(lectures.title)),
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

  it("includes weeks with one lecture, several lectures and no lectures", async () => {
    const pharmacology = await connection.db.query.courses.findFirst({
      where: eq(courses.slug, "pharmacology"),
      with: { weeks: { with: { lectures: true }, orderBy: asc(weeks.number) } },
    });

    expect(pharmacology?.weeks.map((week) => [week.number, week.lectures.length])).toEqual([
      [3, 1],
      [4, 2],
      [5, 0],
    ]);
  });

  it("marks fixture lectures as development data and completes none of them", async () => {
    const rows = await connection.db.query.lectures.findMany({ with: { progress: true } });
    expect(rows).toHaveLength(3);
    for (const lecture of rows) {
      expect(lecture.title).toMatch(/^Development fixture/);
      expect(lecture.progress).toBeNull();
    }
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
