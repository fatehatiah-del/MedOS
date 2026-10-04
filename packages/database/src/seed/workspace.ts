import { CURRENT_SEMESTER } from "@medos/shared";
import { and, asc, eq, sql } from "drizzle-orm";

import type { Database } from "../client";
import { type Semester, courses, semesters, weeks } from "../schema";

import { importUniversityCalendar, universityCalendarFor } from "./calendar";
import { seedFixtureLectures } from "./development";
import { seedSemester } from "./semester";

export interface EnsureWorkspaceOptions {
  /**
   * Also create the placeholder weeks and lectures when the user has none.
   * A development aid: leave it off wherever real material will be imported.
   */
  fixtureLectures?: boolean;
}

/**
 * Makes sure a user has their current semester and its courses, creating them
 * from the academic definitions on first use, and their university calendar,
 * imported again whenever the timetable or academic dates change. Returns the
 * semester.
 *
 * Called whenever the workspace is opened, so the common case (everything
 * already exists and is current) costs a single indexed lookup. Creation is idempotent, which
 * makes two simultaneous first requests harmless.
 */
export async function ensureWorkspace(
  db: Database,
  userId: string,
  options: EnsureWorkspaceOptions = {},
): Promise<Semester> {
  const findSemester = async () => {
    const [semester] = await db
      .select()
      .from(semesters)
      .where(and(eq(semesters.userId, userId), eq(semesters.slug, CURRENT_SEMESTER.id)));
    return semester;
  };

  let semester = (await findSemester()) ?? (await seedSemester(db, userId)).semester;

  const calendar = universityCalendarFor(semester.slug);
  if (calendar && semester.calendarVersion !== calendar.version) {
    await importUniversityCalendar(db, semester);
    semester = (await findSemester()) ?? semester;
  }

  if (options.fixtureLectures) {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(weeks)
      .where(eq(weeks.userId, userId));
    if ((row?.count ?? 0) === 0) {
      const semesterCourses = await db
        .select()
        .from(courses)
        .where(eq(courses.semesterId, semester.id))
        .orderBy(asc(courses.position));
      await seedFixtureLectures(db, semesterCourses, semester.startsOn);
    }
  }

  return semester;
}
