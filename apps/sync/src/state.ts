import {
  type Course,
  type Database,
  type Lecture,
  type Resource,
  type Semester,
  type SyncFile,
  type Week,
  courses,
  lectures,
  resources,
  semesters,
  syncFiles,
  users,
  weeks,
} from "@medos/database";
import { FIXTURE_LECTURE_PREFIX } from "@medos/database";
import { CURRENT_SEMESTER } from "@medos/shared";
import { and, eq, like, sql } from "drizzle-orm";

/**
 * Everything a sync needs to know about one user's MedOS data, loaded with
 * reads only. Every query is filtered by the user's id: a sync never sees,
 * let alone changes, another user's data.
 */
export interface SyncState {
  userId: string;
  semester: Semester | null;
  coursesBySlug: Map<string, Course>;
  weeksByKey: Map<string, Week>;
  lecturesByKey: Map<string, Lecture>;
  lecturesById: Map<string, Lecture>;
  resourcesById: Map<string, Resource>;
  /** What earlier syncs recorded, by path relative to the source folder. */
  manifest: Map<string, SyncFile>;
  /** Development placeholder lectures that must not be mixed with real ones. */
  placeholderLectures: number;
}

export const weekKey = (courseId: string, number: number) => `${courseId}/${number}`;
export const lectureKey = (weekId: string, number: number) => `${weekId}/${number}`;

export class SyncError extends Error {
  override name = "SyncError";
}

export async function findUserId(db: Database, email: string): Promise<string> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()));
  if (!user) {
    throw new SyncError(
      `No MedOS account uses ${email}. Sign up in the app first, then run the sync with that address.`,
    );
  }
  return user.id;
}

export async function loadSyncState(db: Database, userId: string): Promise<SyncState> {
  const [semester] = await db
    .select()
    .from(semesters)
    .where(and(eq(semesters.userId, userId), eq(semesters.slug, CURRENT_SEMESTER.id)));

  const courseRows = semester
    ? await db
        .select()
        .from(courses)
        .where(and(eq(courses.userId, userId), eq(courses.semesterId, semester.id)))
    : [];
  const weekRows = await db.select().from(weeks).where(eq(weeks.userId, userId));
  const lectureRows = await db.select().from(lectures).where(eq(lectures.userId, userId));
  const resourceRows = await db.select().from(resources).where(eq(resources.userId, userId));
  const manifestRows = await db.select().from(syncFiles).where(eq(syncFiles.userId, userId));
  const [placeholders] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(lectures)
    .where(and(eq(lectures.userId, userId), like(lectures.title, `${FIXTURE_LECTURE_PREFIX}%`)));

  return {
    userId,
    semester: semester ?? null,
    coursesBySlug: new Map(courseRows.map((course) => [course.slug, course])),
    weeksByKey: new Map(weekRows.map((week) => [weekKey(week.courseId, week.number), week])),
    lecturesByKey: new Map(
      lectureRows.map((lecture) => [lectureKey(lecture.weekId, lecture.number), lecture]),
    ),
    lecturesById: new Map(lectureRows.map((lecture) => [lecture.id, lecture])),
    resourcesById: new Map(resourceRows.map((resource) => [resource.id, resource])),
    manifest: new Map(manifestRows.map((row) => [row.relativePath, row])),
    placeholderLectures: placeholders?.count ?? 0,
  };
}
