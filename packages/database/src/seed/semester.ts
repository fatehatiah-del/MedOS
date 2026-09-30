import { COURSES, type CourseDefinition, FALL_2026, type SemesterDefinition } from "@medos/shared";
import { and, asc, eq } from "drizzle-orm";

import type { Database } from "../client";
import { type Course, type Semester, courses, semesters } from "../schema";

import { overwriteWhenChanged } from "./upsert";

export interface SeededSemester {
  semester: Semester;
  courses: Course[];
}

/**
 * Creates or refreshes a semester and its courses for one user, from the
 * academic definitions in `@medos/shared`.
 *
 * Idempotent: rows are matched on their natural keys (user + semester slug,
 * semester + course slug). Running it again creates nothing, and rewrites a
 * row only if it no longer matches the definition. It does not touch weeks,
 * lectures or any study data.
 */
export async function seedSemester(
  db: Database,
  userId: string,
  definition: SemesterDefinition = FALL_2026,
  courseDefinitions: readonly CourseDefinition[] = COURSES,
): Promise<SeededSemester> {
  await db
    .insert(semesters)
    .values({
      userId,
      slug: definition.id,
      name: definition.name,
      label: definition.label,
      academicYear: definition.academicYear,
      institution: definition.institution,
      programme: definition.programme,
      studentGroup: definition.group,
      startsOn: definition.term.start,
      endsOn: definition.term.end,
      midtermsStartOn: definition.midterms.start,
      midtermsEndOn: definition.midterms.end,
      finalsStartOn: definition.finals.start,
      finalsEndOn: definition.finals.end,
    })
    .onConflictDoUpdate({
      target: [semesters.userId, semesters.slug],
      ...overwriteWhenChanged({
        name: semesters.name,
        label: semesters.label,
        academicYear: semesters.academicYear,
        institution: semesters.institution,
        programme: semesters.programme,
        studentGroup: semesters.studentGroup,
        startsOn: semesters.startsOn,
        endsOn: semesters.endsOn,
        midtermsStartOn: semesters.midtermsStartOn,
        midtermsEndOn: semesters.midtermsEndOn,
        finalsStartOn: semesters.finalsStartOn,
        finalsEndOn: semesters.finalsEndOn,
      }),
    });

  const [semester] = await db
    .select()
    .from(semesters)
    .where(and(eq(semesters.userId, userId), eq(semesters.slug, definition.id)));
  if (!semester) throw new Error(`Failed to seed semester "${definition.id}".`);

  await db
    .insert(courses)
    .values(
      courseDefinitions.map((course, index) => ({
        userId,
        semesterId: semester.id,
        slug: course.id,
        name: course.name,
        shortName: course.shortName,
        // The design system names each course colour token after the course slug.
        colorToken: course.id,
        position: index + 1,
      })),
    )
    .onConflictDoUpdate({
      target: [courses.semesterId, courses.slug],
      ...overwriteWhenChanged({
        name: courses.name,
        shortName: courses.shortName,
        colorToken: courses.colorToken,
        position: courses.position,
      }),
    });

  const seededCourses = await db
    .select()
    .from(courses)
    .where(eq(courses.semesterId, semester.id))
    .orderBy(asc(courses.position));

  return { semester, courses: seededCourses };
}
