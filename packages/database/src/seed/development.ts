import { and, eq } from "drizzle-orm";

import type { Database } from "../client";
import { type Course, type User, lectures, users, weeks } from "../schema";

import { type SeededSemester, seedSemester } from "./semester";
import { overwriteWhenChanged } from "./upsert";

/*
 * DEVELOPMENT DATA — not real university content.
 *
 * A placeholder user and a handful of structural weeks and lectures, so the
 * application has something to read before authentication (Phase 3) and sync
 * (Phase 5) exist. Lecture titles are deliberately generic: MedOS never
 * invents medical content.
 */

export const DEVELOPMENT_USER = {
  // ".invalid" is reserved and can never be a real address.
  email: "student@medos.invalid",
  displayName: "Fateh",
} as const;

export const DEVELOPMENT_COURSE_SLUG = "pharmacology";

/** Weeks with one lecture, several lectures and no lectures. */
export const DEVELOPMENT_WEEKS: readonly { number: number; lectures: number }[] = [
  { number: 3, lectures: 1 },
  { number: 4, lectures: 2 },
  { number: 5, lectures: 0 },
];

export interface DevelopmentSeedResult extends SeededSemester {
  user: User;
  weekCount: number;
  lectureCount: number;
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

async function seedDevelopmentLectures(
  db: Database,
  course: Course,
): Promise<{ weekCount: number; lectureCount: number }> {
  let lectureCount = 0;

  for (const fixture of DEVELOPMENT_WEEKS) {
    await db
      .insert(weeks)
      .values({ userId: course.userId, courseId: course.id, number: fixture.number })
      .onConflictDoNothing({ target: [weeks.courseId, weeks.number] });

    const [week] = await db
      .select()
      .from(weeks)
      .where(and(eq(weeks.courseId, course.id), eq(weeks.number, fixture.number)));
    if (!week) throw new Error(`Failed to seed week ${fixture.number}.`);

    for (let number = 1; number <= fixture.lectures; number += 1) {
      await db
        .insert(lectures)
        .values({
          userId: course.userId,
          courseId: course.id,
          weekId: week.id,
          number,
          title: `Development fixture: week ${fixture.number}, lecture ${number}`,
        })
        .onConflictDoUpdate({
          target: [lectures.weekId, lectures.number],
          ...overwriteWhenChanged({ title: lectures.title }),
        });
      lectureCount += 1;
    }
  }

  return { weekCount: DEVELOPMENT_WEEKS.length, lectureCount };
}

/**
 * Seeds everything a development database needs, in one transaction: the
 * placeholder user, the Fall 2026 semester with its six courses, and the
 * structural fixture weeks. Safe to run repeatedly.
 */
export async function seedDevelopment(db: Database): Promise<DevelopmentSeedResult> {
  return db.transaction(async (tx) => {
    const user = await seedDevelopmentUser(tx);
    const seeded = await seedSemester(tx, user.id);

    const course = seeded.courses.find((candidate) => candidate.slug === DEVELOPMENT_COURSE_SLUG);
    if (!course) throw new Error(`Course "${DEVELOPMENT_COURSE_SLUG}" was not seeded.`);
    const counts = await seedDevelopmentLectures(tx, course);

    return { user, ...seeded, ...counts };
  });
}
