import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database, DatabaseConnection } from "../client";
import {
  createCourse,
  createCourseForNewUser,
  createLecture,
  createUser,
  createWeek,
  first,
  violation,
} from "../test-support";
import { createTestDatabase } from "../testing";

import {
  calendarEvents,
  courseProgress,
  courses,
  examEvents,
  lectureProgress,
  lectures,
  resources,
  semesters,
  studySessions,
  syncFiles,
  users,
  weeks,
} from "./index";

let connection: DatabaseConnection;
let db: Database;

beforeAll(async () => {
  connection = await createTestDatabase();
  db = connection.db;
});

afterAll(async () => {
  await connection.close();
});

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

describe("academic hierarchy", () => {
  it("lets a course have many weeks, and a week have zero, one or several lectures", async () => {
    const { course } = await createCourseForNewUser(db);
    const empty = await createWeek(db, course, 1);
    const single = await createWeek(db, course, 2);
    const double = await createWeek(db, course, 3);
    await createLecture(db, single, 1);
    await createLecture(db, double, 1);
    await createLecture(db, double, 2);

    const loaded = await db.query.courses.findFirst({
      where: eq(courses.id, course.id),
      with: {
        weeks: {
          orderBy: asc(weeks.number),
          with: { lectures: { orderBy: asc(lectures.number) } },
        },
      },
    });

    expect(loaded?.weeks.map((week) => week.id)).toEqual([empty.id, single.id, double.id]);
    expect(loaded?.weeks.map((week) => week.lectures.length)).toEqual([0, 1, 2]);
    expect(loaded?.weeks[2]?.lectures.map((lecture) => lecture.number)).toEqual([1, 2]);
  });

  it("links every lecture to its own week and course", async () => {
    const { course } = await createCourseForNewUser(db);
    const week = await createWeek(db, course, 4);
    const lecture = await createLecture(db, week, 2);

    const loaded = await db.query.lectures.findFirst({
      where: eq(lectures.id, lecture.id),
      with: { week: true, course: { with: { semester: { with: { user: true } } } } },
    });

    expect(loaded?.week.id).toBe(week.id);
    expect(loaded?.week.number).toBe(4);
    expect(loaded?.course.id).toBe(course.id);
    expect(loaded?.course.semester.user.id).toBe(course.userId);

    const byCourse = await db.select().from(lectures).where(eq(lectures.courseId, course.id));
    expect(byCourse.map((row) => row.id)).toEqual([lecture.id]);
  });

  it("rejects a lecture whose course is not the course of its week", async () => {
    const { semester, course } = await createCourseForNewUser(db, "pharmacology");
    const otherCourse = await createCourse(db, semester, "pathology");
    const week = await createWeek(db, course, 1);

    const reason = await violation(() =>
      db.insert(lectures).values({
        userId: course.userId,
        courseId: otherCourse.id,
        weekId: week.id,
        number: 1,
        title: "Misfiled lecture",
      }),
    );

    expect(reason).toContain("lectures_week_fk");
  });

  it("rejects a second week with the same number in one course", async () => {
    const { course } = await createCourseForNewUser(db);
    await createWeek(db, course, 4);

    expect(await violation(() => createWeek(db, course, 4))).toContain(
      "weeks_course_number_unique",
    );
  });

  it("allows the same week number in different courses", async () => {
    const { semester, course } = await createCourseForNewUser(db, "pharmacology");
    const otherCourse = await createCourse(db, semester, "pathology");

    const a = await createWeek(db, course, 4);
    const b = await createWeek(db, otherCourse, 4);

    expect(a.id).not.toBe(b.id);
  });

  it("rejects a second lecture with the same number in one week", async () => {
    const { course } = await createCourseForNewUser(db);
    const week = await createWeek(db, course, 1);
    await createLecture(db, week, 1);

    expect(await violation(() => createLecture(db, week, 1))).toContain(
      "lectures_week_number_unique",
    );
  });

  it("rejects week and lecture numbers below 1", async () => {
    const { course } = await createCourseForNewUser(db);
    const week = await createWeek(db, course, 1);

    expect(await violation(() => createWeek(db, course, 0))).toContain("weeks_number_positive");
    expect(await violation(() => createLecture(db, week, 0))).toContain("lectures_number_positive");
  });

  it("rejects duplicate course slugs in a semester and malformed slugs", async () => {
    const { semester } = await createCourseForNewUser(db, "pharmacology");

    expect(await violation(() => createCourse(db, semester, "pharmacology"))).toContain(
      "courses_semester_slug_unique",
    );
    expect(await violation(() => createCourse(db, semester, "Public Health"))).toContain(
      "courses_slug_format",
    );
  });

  it("requires semester dates and exam periods to be ordered and complete", async () => {
    const user = await createUser(db);
    const base = { userId: user.id, name: "Fall 2026", label: "Semester 5" };

    expect(
      await violation(() =>
        db
          .insert(semesters)
          .values({ ...base, slug: "reversed", startsOn: "2027-01-29", endsOn: "2026-09-28" }),
      ),
    ).toContain("semesters_term_order");

    expect(
      await violation(() =>
        db.insert(semesters).values({
          ...base,
          slug: "half-period",
          startsOn: "2026-09-28",
          endsOn: "2027-01-29",
          midtermsStartOn: "2026-11-12",
        }),
      ),
    ).toContain("semesters_midterms_period");
  });
});

describe("ownership", () => {
  it("gives two users fully independent data, even with identical slugs", async () => {
    const mine = await createCourseForNewUser(db, "pharmacology");
    const theirs = await createCourseForNewUser(db, "pharmacology");

    expect(mine.semester.slug).toBe(theirs.semester.slug);
    expect(mine.course.id).not.toBe(theirs.course.id);

    const owned = await db.select().from(courses).where(eq(courses.userId, mine.user.id));
    expect(owned.map((course) => course.id)).toEqual([mine.course.id]);
  });

  it("rejects a course attached to another user's semester", async () => {
    const mine = await createCourseForNewUser(db);
    const stranger = await createUser(db);

    const reason = await violation(() =>
      db.insert(courses).values({
        userId: stranger.id,
        semesterId: mine.semester.id,
        slug: "intruder",
        name: "Intruder",
        shortName: "Intruder",
      }),
    );

    expect(reason).toContain("courses_semester_fk");
  });

  it("rejects progress recorded against another user's lecture", async () => {
    const { course } = await createCourseForNewUser(db);
    const lecture = await createLecture(db, await createWeek(db, course, 1), 1);
    const stranger = await createUser(db);

    const reason = await violation(() =>
      db.insert(lectureProgress).values({ userId: stranger.id, lectureId: lecture.id }),
    );

    expect(reason).toContain("lecture_progress_lecture_fk");
  });

  it("requires every owned row to have an existing owner", async () => {
    const reason = await violation(() =>
      db.insert(semesters).values({
        userId: "00000000-0000-4000-8000-000000000000",
        slug: "orphan",
        name: "Orphan",
        label: "Orphan",
        startsOn: "2026-09-28",
        endsOn: "2027-01-29",
      }),
    );

    expect(reason).toContain("semesters_user_id_users_id_fk");
  });

  it("stores emails in lowercase and keeps them unique", async () => {
    const user = await createUser(db);

    expect(
      await violation(() =>
        db.insert(users).values({ email: "Mixed@Example.test", displayName: "Mixed" }),
      ),
    ).toContain("users_email_lowercase");
    expect(
      await violation(() => db.insert(users).values({ email: user.email, displayName: "Twin" })),
    ).toContain("users_email_unique");
  });
});

describe("deletion", () => {
  it("refuses to delete anything that still has dependent data", async () => {
    const { user, semester, course } = await createCourseForNewUser(db);
    const week = await createWeek(db, course, 1);
    const lecture = await createLecture(db, week, 1);
    await db.insert(lectureProgress).values({ userId: user.id, lectureId: lecture.id });

    expect(await violation(() => db.delete(lectures).where(eq(lectures.id, lecture.id)))).toContain(
      "lecture_progress_lecture_fk",
    );
    expect(await violation(() => db.delete(weeks).where(eq(weeks.id, week.id)))).toContain(
      "lectures_week_fk",
    );
    expect(await violation(() => db.delete(courses).where(eq(courses.id, course.id)))).toContain(
      "weeks_course_fk",
    );
    expect(
      await violation(() => db.delete(semesters).where(eq(semesters.id, semester.id))),
    ).toContain("courses_semester_fk");
    expect(await violation(() => db.delete(users).where(eq(users.id, user.id)))).toContain(
      "_user_id_users_id_fk",
    );

    // Everything is still there.
    expect(await db.select().from(lectures).where(eq(lectures.id, lecture.id))).toHaveLength(1);
  });

  it("allows deliberate bottom-up deletion", async () => {
    const { course } = await createCourseForNewUser(db);
    const week = await createWeek(db, course, 1);
    const lecture = await createLecture(db, week, 1);

    await db.delete(lectures).where(eq(lectures.id, lecture.id));
    await db.delete(weeks).where(eq(weeks.id, week.id));

    expect(await db.select().from(weeks).where(eq(weeks.courseId, course.id))).toHaveLength(0);
  });
});

describe("lecture progress", () => {
  it("is incomplete until the user says otherwise, and can be undone", async () => {
    const { user, course } = await createCourseForNewUser(db);
    const lecture = await createLecture(db, await createWeek(db, course, 1), 1);

    const progress = first(
      await db
        .insert(lectureProgress)
        .values({ userId: user.id, lectureId: lecture.id })
        .returning(),
    );
    expect(progress.completedAt).toBeNull();

    const completedAt = new Date("2026-10-02T16:30:00Z");
    const completed = first(
      await db
        .update(lectureProgress)
        .set({ completedAt })
        .where(eq(lectureProgress.id, progress.id))
        .returning(),
    );
    expect(completed.completedAt).toEqual(completedAt);
    expect(completed.updatedAt.getTime()).toBeGreaterThanOrEqual(progress.updatedAt.getTime());

    const undone = first(
      await db
        .update(lectureProgress)
        .set({ completedAt: null })
        .where(eq(lectureProgress.id, progress.id))
        .returning(),
    );
    expect(undone.completedAt).toBeNull();
  });

  it("keeps one progress row per lecture", async () => {
    const { user, course } = await createCourseForNewUser(db);
    const lecture = await createLecture(db, await createWeek(db, course, 1), 1);
    const row = { userId: user.id, lectureId: lecture.id };
    await db.insert(lectureProgress).values(row);

    expect(await violation(() => db.insert(lectureProgress).values(row))).toContain(
      "lecture_progress_lecture_unique",
    );
  });

  it("derives course progress from lectures the user has marked complete", async () => {
    const { user, semester, course } = await createCourseForNewUser(db, "pharmacology");
    const untouched = await createCourse(db, semester, "pathology");
    const week = await createWeek(db, course, 1);
    const done = await createLecture(db, week, 1);
    const started = await createLecture(db, week, 2);
    await createLecture(db, week, 3);
    await db.insert(lectureProgress).values([
      { userId: user.id, lectureId: done.id, completedAt: new Date() },
      { userId: user.id, lectureId: started.id },
    ]);

    const rows = await db.select().from(courseProgress).where(eq(courseProgress.userId, user.id));
    const byCourse = new Map(rows.map((row) => [row.courseId, row]));

    expect(byCourse.get(course.id)).toMatchObject({ lectureCount: 3, completedLectureCount: 1 });
    expect(byCourse.get(untouched.id)).toMatchObject({
      lectureCount: 0,
      completedLectureCount: 0,
    });
  });
});

describe("resources and provenance", () => {
  async function lectureFor(slug?: string) {
    const { user, course } = await createCourseForNewUser(db, slug);
    const lecture = await createLecture(db, await createWeek(db, course, 4), 1);
    return { user, course, lecture };
  }

  it("records where a file came from and traces it back to its course", async () => {
    const { user, course, lecture } = await lectureFor();
    const resource = first(
      await db
        .insert(resources)
        .values({
          userId: user.id,
          lectureId: lecture.id,
          kind: "study-guide",
          originalFilename: "StudyGuide.docx",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          sizeBytes: 48_213,
          contentHash: HASH_A,
          sourcePath: "Pharma/w4/lecture-1/StudyGuide.docx",
        })
        .returning(),
    );

    expect(resource.status).toBe("pending");
    expect(resource.storageKey).toBeNull();

    const traced = await db.query.resources.findFirst({
      where: eq(resources.id, resource.id),
      with: { lecture: { with: { week: true, course: true } } },
    });
    expect(traced?.lecture.week.number).toBe(4);
    expect(traced?.lecture.course.id).toBe(course.id);
  });

  it("holds several resources of different kinds for one lecture", async () => {
    const { user, lecture } = await lectureFor();
    const base = {
      userId: user.id,
      lectureId: lecture.id,
      mimeType: "application/pdf",
      sizeBytes: 1,
    };
    await db.insert(resources).values([
      { ...base, kind: "original-lecture", originalFilename: "Lecture.pdf", contentHash: HASH_A },
      {
        ...base,
        kind: "question-bank",
        originalFilename: "QuestionBank.docx",
        contentHash: HASH_B,
      },
    ]);

    const loaded = await db.query.lectures.findFirst({
      where: eq(lectures.id, lecture.id),
      with: { resources: true },
    });
    expect(loaded?.resources.map((resource) => resource.kind).sort()).toEqual([
      "original-lecture",
      "question-bank",
    ]);
  });

  it("rejects the same file twice on one lecture, unknown kinds and malformed hashes", async () => {
    const { user, lecture } = await lectureFor();
    const valid = {
      userId: user.id,
      lectureId: lecture.id,
      kind: "mcq",
      originalFilename: "Quiz.html",
      mimeType: "text/html",
      sizeBytes: 10,
      contentHash: HASH_A,
    } as const;
    await db.insert(resources).values(valid);

    expect(await violation(() => db.insert(resources).values(valid))).toContain(
      "resources_lecture_hash_unique",
    );
    expect(
      await violation(() =>
        db
          .insert(resources)
          // Bypass the compile-time union to prove the database enforces it too.
          .values({ ...valid, contentHash: HASH_B, kind: "video" as "mcq" }),
      ),
    ).toContain("resources_kind_valid");
    expect(
      await violation(() => db.insert(resources).values({ ...valid, contentHash: "not-a-hash" })),
    ).toContain("resources_hash_format");
  });

  it("tracks sync state by relative path, once per user", async () => {
    const { user } = await lectureFor();
    const file = {
      userId: user.id,
      relativePath: "Pharma/w4/lecture-1/StudyGuide.docx",
      contentHash: HASH_A,
      sizeBytes: 48_213,
      modifiedAt: new Date("2026-10-20T09:00:00Z"),
      detectedCourseSlug: "pharmacology",
      detectedWeekNumber: 4,
      detectedLectureNumber: 1,
      detectedKind: "study-guide",
    } as const;

    const stored = first(await db.insert(syncFiles).values(file).returning());
    expect(stored.status).toBe("pending");
    expect(stored.resourceId).toBeNull();

    expect(await violation(() => db.insert(syncFiles).values(file))).toContain(
      "sync_files_user_path_unique",
    );
    expect(
      await violation(() =>
        db
          .insert(syncFiles)
          .values({ ...file, relativePath: "C:\\Users\\someone\\Downloads\\S5\\file.docx" }),
      ),
    ).toContain("sync_files_path_relative");
  });
});

describe("calendar and exams", () => {
  const timed = {
    type: "lecture",
    origin: "university",
    title: "Timetable lecture",
    startsAt: new Date("2026-09-30T09:30:00Z"),
    endsAt: new Date("2026-09-30T12:50:00Z"),
    timezone: "Europe/Berlin",
  } as const;

  it("stores events as instants with their time zone and finds them by date range", async () => {
    const { user, course } = await createCourseForNewUser(db);
    await db.insert(calendarEvents).values([
      { ...timed, userId: user.id, courseId: course.id, location: "Sigma" },
      {
        userId: user.id,
        type: "holiday",
        origin: "university",
        title: "No course",
        startsAt: new Date("2026-12-24T23:00:00Z"),
        endsAt: new Date("2026-12-25T23:00:00Z"),
        allDay: true,
        timezone: "Europe/Berlin",
      },
    ]);

    const events = await db.query.calendarEvents.findMany({
      where: eq(calendarEvents.userId, user.id),
      orderBy: asc(calendarEvents.startsAt),
      with: { course: true },
    });

    expect(events.map((event) => [event.type, event.course?.id ?? null])).toEqual([
      ["lecture", course.id],
      ["holiday", null],
    ]);
    expect(events[0]?.startsAt.toISOString()).toBe("2026-09-30T09:30:00.000Z");
    expect(events[0]?.timezone).toBe("Europe/Berlin");
  });

  it("rejects events that end before they start and unknown event types", async () => {
    const user = await createUser(db);

    expect(
      await violation(() =>
        db
          .insert(calendarEvents)
          .values({ ...timed, userId: user.id, endsAt: new Date("2026-09-30T08:00:00Z") }),
      ),
    ).toContain("calendar_events_time_order");
    expect(
      await violation(() =>
        db
          .insert(calendarEvents)
          .values({ ...timed, userId: user.id, type: "party" as "personal" }),
      ),
    ).toContain("calendar_events_type_valid");
  });

  it("attaches exam detail to an event of the same course, once", async () => {
    const { user, semester, course } = await createCourseForNewUser(db, "pharmacology");
    const otherCourse = await createCourse(db, semester, "pathology");
    const event = first(
      await db
        .insert(calendarEvents)
        .values({
          ...timed,
          type: "midterm",
          title: "Midterm",
          userId: user.id,
          courseId: course.id,
        })
        .returning(),
    );
    const exam = { userId: user.id, calendarEventId: event.id, kind: "midterm" } as const;

    expect(
      await violation(() => db.insert(examEvents).values({ ...exam, courseId: otherCourse.id })),
    ).toContain("exam_events_calendar_event_fk");

    await db.insert(examEvents).values({ ...exam, courseId: course.id });
    expect(
      await violation(() => db.insert(examEvents).values({ ...exam, courseId: course.id })),
    ).toContain("exam_events_calendar_event_unique");

    const loaded = await db.query.calendarEvents.findFirst({
      where: eq(calendarEvents.id, event.id),
      with: { exam: { with: { course: true } } },
    });
    expect(loaded?.exam?.kind).toBe("midterm");
    expect(loaded?.exam?.course.id).toBe(course.id);
  });
});

describe("study sessions", () => {
  it("records active time against a course and lecture", async () => {
    const { user, course } = await createCourseForNewUser(db);
    const lecture = await createLecture(db, await createWeek(db, course, 1), 1);

    const session = first(
      await db
        .insert(studySessions)
        .values({
          userId: user.id,
          courseId: course.id,
          lectureId: lecture.id,
          activity: "study-guide",
          startedAt: new Date("2026-10-01T17:00:00Z"),
        })
        .returning(),
    );

    // Open until finished; no time is counted until it is reported.
    expect(session.endedAt).toBeNull();
    expect(session.activeSeconds).toBe(0);
  });

  it("rejects negative durations and sessions that end before they start", async () => {
    const user = await createUser(db);
    const base = {
      userId: user.id,
      activity: "revision",
      startedAt: new Date("2026-10-01T17:00:00Z"),
    } as const;

    expect(
      await violation(() => db.insert(studySessions).values({ ...base, activeSeconds: -1 })),
    ).toContain("study_sessions_active_not_negative");
    expect(
      await violation(() =>
        db.insert(studySessions).values({ ...base, endedAt: new Date("2026-10-01T16:00:00Z") }),
      ),
    ).toContain("study_sessions_time_order");
  });
});
