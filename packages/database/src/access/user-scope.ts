import { and, asc, eq, like, sql } from "drizzle-orm";

import type { Database } from "../client";
import { FIXTURE_LECTURE_PREFIX } from "../seed/development";
import {
  type Course,
  type Lecture,
  type LectureProgress,
  type Resource,
  type ResourceKind,
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
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

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

const resourceSummaryColumns = {
  id: true,
  lectureId: true,
  kind: true,
  originalFilename: true,
  mimeType: true,
  sizeBytes: true,
  status: true,
  createdAt: true,
} as const;

/** A course with the counts its card needs. */
export interface CourseOverview {
  course: Course;
  weekCount: number;
  lectureCount: number;
  /** Lectures the user has explicitly marked complete. */
  completedLectureCount: number;
  /** The highest week number that has at least one lecture, if any. */
  latestWeekWithLectures: number | null;
}

/** A lecture as it appears in a course outline. */
export interface LectureOutline {
  id: string;
  number: number;
  title: string;
  heldOn: string | null;
  /** When the user marked it complete; null while it is not complete. */
  completedAt: Date | null;
  /** Kinds of source material attached to the lecture, without duplicates. */
  resourceKinds: ResourceKind[];
}

/** A week with its lectures in order. `lectures` is empty for a week without lectures. */
export interface WeekOutline {
  id: string;
  number: number;
  startsOn: string | null;
  endsOn: string | null;
  lectures: LectureOutline[];
}

/** Everything the lecture page shows, loaded together. */
export interface LectureDetail {
  lecture: Lecture;
  week: Week;
  course: Course;
  completedAt: Date | null;
  resources: ResourceSummary[];
  /** The lectures of the same week, in order, including this one. */
  weekLectures: { id: string; number: number; title: string }[];
}

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

      /** A course by its URL slug within a semester. */
      async getBySlug(semesterId: string, slug: string): Promise<Course | null> {
        if (!isId(semesterId) || !SLUG.test(slug)) return null;
        const [course] = await db
          .select()
          .from(courses)
          .where(
            and(
              eq(courses.semesterId, semesterId),
              eq(courses.slug, slug),
              eq(courses.userId, userId),
            ),
          );
        return course ?? null;
      },

      /**
       * The courses of a semester in display order, each with its lecture and
       * completion counts. One query for all courses.
       */
      async overview(semesterId: string): Promise<CourseOverview[]> {
        if (!isId(semesterId)) return [];
        return db
          .select({
            course: courses,
            weekCount: sql<number>`count(distinct ${weeks.id})::int`,
            lectureCount: sql<number>`count(distinct ${lectures.id})::int`,
            completedLectureCount: sql<number>`(count(distinct ${lectures.id}) filter (where ${lectureProgress.completedAt} is not null))::int`,
            latestWeekWithLectures: sql<
              number | null
            >`max(${weeks.number}) filter (where ${lectures.id} is not null)`,
          })
          .from(courses)
          .leftJoin(weeks, eq(weeks.courseId, courses.id))
          .leftJoin(lectures, eq(lectures.weekId, weeks.id))
          .leftJoin(lectureProgress, eq(lectureProgress.lectureId, lectures.id))
          .where(and(eq(courses.semesterId, semesterId), eq(courses.userId, userId)))
          .groupBy(courses.id)
          .orderBy(asc(courses.position));
      },

      /**
       * A course's weeks in order, each with its lectures in order, their
       * completion and the kinds of material attached. One query, whatever
       * the number of weeks and lectures. Null if the course is not the user's.
       */
      async outline(courseId: string): Promise<WeekOutline[] | null> {
        if (!isId(courseId)) return null;
        const course = await db.query.courses.findFirst({
          where: and(eq(courses.id, courseId), eq(courses.userId, userId)),
          columns: { id: true },
          with: {
            weeks: {
              orderBy: asc(weeks.number),
              columns: { id: true, number: true, startsOn: true, endsOn: true },
              with: {
                lectures: {
                  orderBy: asc(lectures.number),
                  columns: { id: true, number: true, title: true, heldOn: true },
                  with: {
                    progress: { columns: { completedAt: true } },
                    resources: { columns: { kind: true } },
                  },
                },
              },
            },
          },
        });
        if (!course) return null;

        return course.weeks.map((week) => ({
          ...week,
          lectures: week.lectures.map(({ progress, resources: attached, ...lecture }) => ({
            ...lecture,
            completedAt: progress?.completedAt ?? null,
            resourceKinds: [...new Set(attached.map((resource) => resource.kind))],
          })),
        }));
      },
    },

    lectures: {
      get: getLecture,

      /** Whether any of the user's lectures is a development placeholder. */
      async includesFixtures(): Promise<boolean> {
        const [row] = await db
          .select({ id: lectures.id })
          .from(lectures)
          .where(
            and(eq(lectures.userId, userId), like(lectures.title, `${FIXTURE_LECTURE_PREFIX}%`)),
          )
          .limit(1);
        return row !== undefined;
      },

      /** A lecture with its week, course, completion, resources and sibling lectures. */
      async detail(lectureId: string): Promise<LectureDetail | null> {
        if (!isId(lectureId)) return null;
        const found = await db.query.lectures.findFirst({
          where: and(eq(lectures.id, lectureId), eq(lectures.userId, userId)),
          with: {
            course: true,
            week: {
              with: {
                lectures: {
                  orderBy: asc(lectures.number),
                  columns: { id: true, number: true, title: true },
                },
              },
            },
            progress: { columns: { completedAt: true } },
            resources: { columns: resourceSummaryColumns, orderBy: asc(resources.createdAt) },
          },
        });
        if (!found) return null;

        const { course, week, progress, resources: attached, ...lecture } = found;
        const { lectures: weekLectures, ...weekRow } = week;
        return {
          lecture,
          week: weekRow,
          course,
          completedAt: progress?.completedAt ?? null,
          resources: attached,
          weekLectures,
        };
      },

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
