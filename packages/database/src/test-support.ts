import type { Database } from "./client";
import {
  type Course,
  type Lecture,
  type Semester,
  type User,
  type Week,
  courses,
  lectures,
  semesters,
  users,
  weeks,
} from "./schema";

/** Helpers for the database tests. Not exported from the package. */

export function first<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error("Expected the statement to return a row.");
  return row;
}

/**
 * Runs a statement that must be rejected and returns everything the database
 * said about why (message, constraint name), so tests can assert on the
 * specific constraint rather than on "some error".
 */
export async function violation(statement: () => PromiseLike<unknown>): Promise<string> {
  try {
    await statement();
  } catch (error) {
    const parts: string[] = [];
    for (let current: unknown = error; current instanceof Error; current = current.cause) {
      parts.push(current.message);
      if ("constraint" in current && typeof current.constraint === "string") {
        parts.push(current.constraint);
      }
    }
    return parts.join("\n");
  }
  throw new Error("Expected the statement to be rejected, but it succeeded.");
}

let sequence = 0;

export async function createUser(db: Database): Promise<User> {
  sequence += 1;
  return first(
    await db
      .insert(users)
      .values({ email: `owner-${sequence}@example.test`, displayName: `Owner ${sequence}` })
      .returning(),
  );
}

export async function createSemester(db: Database, user: User): Promise<Semester> {
  return first(
    await db
      .insert(semesters)
      .values({
        userId: user.id,
        slug: "2026-fall",
        name: "Fall 2026",
        label: "Semester 5",
        startsOn: "2026-09-28",
        endsOn: "2027-01-29",
      })
      .returning(),
  );
}

export async function createCourse(
  db: Database,
  semester: Semester,
  slug = "pharmacology",
): Promise<Course> {
  return first(
    await db
      .insert(courses)
      .values({
        userId: semester.userId,
        semesterId: semester.id,
        slug,
        name: `Course ${slug}`,
        shortName: slug,
      })
      .returning(),
  );
}

export async function createWeek(db: Database, course: Course, number: number): Promise<Week> {
  return first(
    await db
      .insert(weeks)
      .values({ userId: course.userId, courseId: course.id, number })
      .returning(),
  );
}

export async function createLecture(db: Database, week: Week, number: number): Promise<Lecture> {
  return first(
    await db
      .insert(lectures)
      .values({
        userId: week.userId,
        courseId: week.courseId,
        weekId: week.id,
        number,
        title: `Test lecture ${number}`,
      })
      .returning(),
  );
}

/** A user with one semester and one course: the usual starting point. */
export async function createCourseForNewUser(db: Database, slug?: string) {
  const user = await createUser(db);
  const semester = await createSemester(db, user);
  const course = await createCourse(db, semester, slug);
  return { user, semester, course };
}
