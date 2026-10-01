import { type IsoDate, addDays } from "@medos/shared";
import { and, eq, inArray, like, sql } from "drizzle-orm";

import type { Database } from "../client";
import {
  type Course,
  type User,
  lectureProgress,
  lectures,
  resources,
  users,
  weeks,
} from "../schema";

import { type SeededSemester, seedSemester } from "./semester";
import { overwriteWhenChanged } from "./upsert";

/*
 * DEVELOPMENT DATA — not real university content.
 *
 * Placeholder weeks and lectures that give the course and lecture screens
 * something to show before the sync tool (Phase 5) imports real material.
 * Titles are deliberately generic and say what they are: MedOS never invents
 * medical content.
 */

export const DEVELOPMENT_USER = {
  // ".invalid" is reserved and can never be a real address.
  email: "student@medos.invalid",
  displayName: "Fateh",
} as const;

/**
 * The same shape for every course: weeks with one lecture, a week with none,
 * and a week with two. It exists to exercise "a week holds 0..n lectures".
 */
export const FIXTURE_WEEKS: readonly { number: number; lectures: number }[] = [
  { number: 1, lectures: 1 },
  { number: 2, lectures: 1 },
  { number: 3, lectures: 0 },
  { number: 4, lectures: 2 },
];

/** Every fixture lecture title starts with this, so fixtures can be told apart from real lectures. */
export const FIXTURE_LECTURE_PREFIX = "Sample lecture";

export function fixtureLectureTitle(week: number, lecture: number): string {
  return `${FIXTURE_LECTURE_PREFIX} ${week}.${lecture} (development data)`;
}

export function isFixtureLecture(lecture: { title: string }): boolean {
  return lecture.title.startsWith(FIXTURE_LECTURE_PREFIX);
}

export interface FixtureSeedResult {
  weekCount: number;
  lectureCount: number;
}

export interface DevelopmentSeedResult extends SeededSemester, FixtureSeedResult {
  user: User;
}

export async function seedDevelopmentUser(db: Database): Promise<User> {
  await db
    .insert(users)
    .values(DEVELOPMENT_USER)
    .onConflictDoUpdate({
      target: users.email,
      ...overwriteWhenChanged({ displayName: users.displayName }),
    });

  const [user] = await db.select().from(users).where(eq(users.email, DEVELOPMENT_USER.email));
  if (!user) throw new Error("Failed to seed the development user.");
  return user;
}

/**
 * Creates the fixture weeks and lectures for the given courses. Idempotent,
 * and done in three statements however many courses there are.
 *
 * `termStart` dates each week: week 1 begins on the first day of term.
 */
export async function seedFixtureLectures(
  db: Database,
  courses: readonly Course[],
  termStart: string,
): Promise<FixtureSeedResult> {
  if (courses.length === 0) return { weekCount: 0, lectureCount: 0 };

  await db
    .insert(weeks)
    .values(
      courses.flatMap((course) =>
        FIXTURE_WEEKS.map(({ number }) => {
          const startsOn = addDays(termStart as IsoDate, (number - 1) * 7);
          return {
            userId: course.userId,
            courseId: course.id,
            number,
            startsOn,
            endsOn: addDays(startsOn, 6),
          };
        }),
      ),
    )
    .onConflictDoNothing({ target: [weeks.courseId, weeks.number] });

  const seededWeeks = await db
    .select()
    .from(weeks)
    .where(
      inArray(
        weeks.courseId,
        courses.map((course) => course.id),
      ),
    );

  const lectureCounts = new Map(FIXTURE_WEEKS.map((week) => [week.number, week.lectures]));
  const fixtureLectures = seededWeeks.flatMap((week) =>
    Array.from({ length: lectureCounts.get(week.number) ?? 0 }, (_, index) => ({
      userId: week.userId,
      courseId: week.courseId,
      weekId: week.id,
      number: index + 1,
      title: fixtureLectureTitle(week.number, index + 1),
    })),
  );

  if (fixtureLectures.length > 0) {
    await db
      .insert(lectures)
      .values(fixtureLectures)
      // A lecture already in that position is left alone: real lectures are never overwritten.
      .onConflictDoNothing({ target: [lectures.weekId, lectures.number] });
  }

  return {
    weekCount: courses.length * FIXTURE_WEEKS.length,
    lectureCount: fixtureLectures.length,
  };
}

export interface FixtureRemovalResult {
  lectures: number;
  weeks: number;
}

/**
 * Deletes a user's placeholder lectures, with their completion records, and
 * then any week left without lectures. Real lectures are never touched: a
 * lecture is removed only if its title marks it as a placeholder and no
 * material is attached to it. Runs in one transaction.
 */
export async function removeFixtureLectures(
  db: Database,
  userId: string,
): Promise<FixtureRemovalResult> {
  return db.transaction(async (tx) => {
    const placeholders = await tx
      .select({ id: lectures.id })
      .from(lectures)
      .where(
        and(
          eq(lectures.userId, userId),
          like(lectures.title, `${FIXTURE_LECTURE_PREFIX}%`),
          sql`not exists (select 1 from ${resources} where ${resources.lectureId} = ${lectures.id})`,
        ),
      );
    const ids = placeholders.map((lecture) => lecture.id);
    if (ids.length === 0) return { lectures: 0, weeks: 0 };

    await tx.delete(lectureProgress).where(inArray(lectureProgress.lectureId, ids));
    await tx.delete(lectures).where(inArray(lectures.id, ids));
    const emptied = await tx
      .delete(weeks)
      .where(
        and(
          eq(weeks.userId, userId),
          sql`not exists (select 1 from ${lectures} where ${lectures.weekId} = ${weeks.id})`,
        ),
      )
      .returning({ id: weeks.id });

    return { lectures: ids.length, weeks: emptied.length };
  });
}

/**
 * Seeds everything a development database needs, in one transaction: the
 * placeholder user, the Fall 2026 semester with its six courses, and the
 * fixture weeks and lectures. Safe to run repeatedly.
 */
export async function seedDevelopment(db: Database): Promise<DevelopmentSeedResult> {
  return db.transaction(async (tx) => {
    const user = await seedDevelopmentUser(tx);
    const seeded = await seedSemester(tx, user.id);
    const counts = await seedFixtureLectures(tx, seeded.courses, seeded.semester.startsOn);
    return { user, ...seeded, ...counts };
  });
}
