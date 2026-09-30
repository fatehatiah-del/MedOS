import { and, asc, eq } from "drizzle-orm";

import type { Database } from "../client";
import {
  type Course,
  type Lecture,
  type LectureProgress,
  type Resource,
  type Semester,
  type Week,
  courses,
  lectureProgress,
  lectures,
  resources,
  semesters,
  weeks,
} from "../schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Identifiers arrive from URLs; anything that is not a UUID cannot match a row. */
function isId(value: string): boolean {
  return UUID.test(value);
}

/**
 * What a client may know about a resource. The storage key and source path
 * are deliberately absent: files are only ever reached through MedOS.
 */
export type ResourceSummary = Pick<
  Resource,
  | "id"
  | "lectureId"
  | "kind"
  | "originalFilename"
  | "mimeType"
  | "sizeBytes"
  | "status"
  | "createdAt"
>;

const resourceSummary = {
  id: resources.id,
  lectureId: resources.lectureId,
  kind: resources.kind,
  originalFilename: resources.originalFilename,
  mimeType: resources.mimeType,
  sizeBytes: resources.sizeBytes,
  status: resources.status,
  createdAt: resources.createdAt,
};

export type WeekWithLectures = Week & { lectures: Lecture[] };

/**
 * The authorised way to reach study data: every operation is bound to one
 * user, fixed when the scope is created from the authenticated session.
 *
 * No operation accepts a user id, so there is nothing a caller could pass to
 * reach someone else's data. Looking up a row that belongs to another user
 * behaves exactly like looking up a row that does not exist.
 */
export function createUserScope(db: Database, userId: string) {
  if (!isId(userId)) throw new Error("A user scope requires a valid user id.");

  async function getLecture(lectureId: string): Promise<Lecture | null> {
    if (!isId(lectureId)) return null;
    const [lecture] = await db
      .select()
      .from(lectures)
      .where(and(eq(lectures.id, lectureId), eq(lectures.userId, userId)));
    return lecture ?? null;
  }

  return {
    userId,

    semesters: {
      list(): Promise<Semester[]> {
        return db
          .select()
          .from(semesters)
          .where(eq(semesters.userId, userId))
          .orderBy(asc(semesters.startsOn));
      },
    },

    courses: {
      list(): Promise<Course[]> {
        return db
          .select()
          .from(courses)
          .where(eq(courses.userId, userId))
          .orderBy(asc(courses.position));
      },

      async get(courseId: string): Promise<Course | null> {
        if (!isId(courseId)) return null;
        const [course] = await db
          .select()
          .from(courses)
          .where(and(eq(courses.id, courseId), eq(courses.userId, userId)));
        return course ?? null;
      },

      /** The course's weeks in order, each with its lectures (possibly none). */
      async weeks(courseId: string): Promise<WeekWithLectures[] | null> {
        if (!isId(courseId)) return null;
        const course = await db.query.courses.findFirst({
          where: and(eq(courses.id, courseId), eq(courses.userId, userId)),
          columns: { id: true },
          with: {
            weeks: {
              orderBy: asc(weeks.number),
              with: { lectures: { orderBy: asc(lectures.number) } },
            },
          },
        });
        return course?.weeks ?? null;
      },
    },

    lectures: {
      get: getLecture,

      /**
       * Records the user's explicit decision that a lecture is, or is no
       * longer, complete. This is the only way completion changes.
       */
      async setCompleted(
        lectureId: string,
        completed: boolean,
        at: Date = new Date(),
      ): Promise<LectureProgress | null> {
        if ((await getLecture(lectureId)) === null) return null;
        const completedAt = completed ? at : null;
        const [progress] = await db
          .insert(lectureProgress)
          .values({ userId, lectureId, completedAt })
          .onConflictDoUpdate({
            target: lectureProgress.lectureId,
            set: { completedAt },
            setWhere: eq(lectureProgress.userId, userId),
          })
          .returning();
        return progress ?? null;
      },
    },

    resources: {
      async get(resourceId: string): Promise<ResourceSummary | null> {
        if (!isId(resourceId)) return null;
        const [resource] = await db
          .select(resourceSummary)
          .from(resources)
          .where(and(eq(resources.id, resourceId), eq(resources.userId, userId)));
        return resource ?? null;
      },

      async listForLecture(lectureId: string): Promise<ResourceSummary[]> {
        if (!isId(lectureId)) return [];
        return db
          .select(resourceSummary)
          .from(resources)
          .where(and(eq(resources.lectureId, lectureId), eq(resources.userId, userId)))
          .orderBy(asc(resources.createdAt));
      },
    },
  };
}

export type UserScope = ReturnType<typeof createUserScope>;
