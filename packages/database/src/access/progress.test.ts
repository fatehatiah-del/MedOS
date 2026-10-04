import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database, DatabaseConnection } from "../client";
import { flashcardDecks, flashcards } from "../schema";
import { createCourseForNewUser, createLecture, createWeek, first } from "../test-support";
import { createTestDatabase } from "../testing";

import { createUserScope } from "./user-scope";

/*
 * Progress from real sessions and activity: the streak counts days with
 * timed study, the weekly target follows the user's own study time, and the
 * counts are what was recorded.
 */

let connection: DatabaseConnection;
let db: Database;

// Wednesday 7 October 2026, 14:00 in Frankfurt.
const NOW = new Date("2026-10-07T12:00:00Z");

async function createOwner() {
  const { user, course } = await createCourseForNewUser(db);
  const lecture = await createLecture(db, await createWeek(db, course, 1), 1);
  return { user, course, lecture, scope: createUserScope(db, user.id) };
}

/** A finished session of `minutes` active minutes on `day`, morning in Frankfurt. */
async function study(scope: ReturnType<typeof createUserScope>, day: string, minutes: number) {
  const start = new Date(`${day}T07:00:00Z`);
  const started = await scope.studySessions.start({ activity: "revision" }, start);
  if (!started.ok) throw new Error("not started");
  const end = new Date(start.getTime() + minutes * 60_000);
  // An open page reports every minute; without it the timer would count the session as interrupted.
  for (let at = 5; at < minutes; at += 5) {
    await scope.studySessions.heartbeat(
      started.session.id,
      new Date(start.getTime() + at * 60_000),
    );
  }
  await scope.studySessions.finish(started.session.id, end);
}

beforeAll(async () => {
  connection = await createTestDatabase();
  db = connection.db;
});

afterAll(async () => {
  await connection.close();
});

describe("progress", () => {
  it("is all zero without activity, with the default weekly target", async () => {
    const { scope } = await createOwner();
    const progress = await scope.planner.settings.get().then(() => scope.progress.summary(NOW));
    expect(progress).toMatchObject({
      today: "2026-10-07",
      streak: { current: 0, best: 0, studiedToday: false },
      week: {
        start: "2026-10-05",
        targetMinutes: 5 * 150 + 2 * 240,
        studiedMinutes: 0,
        percent: 0,
      },
      studyMinutes: 0,
      questions: { total: 0, thisWeek: 0 },
      flashcards: { cards: 0, mastered: 0, retention30: null },
    });
  });

  it("builds the streak and the week from recorded study", async () => {
    const { scope } = await createOwner();
    await study(scope, "2026-10-02", 30); // Friday before: breaks from Monday's run by the weekend gap.
    await study(scope, "2026-10-05", 6);
    await study(scope, "2026-10-06", 6);
    // Under a minute is not a study day.
    const brief = await scope.studySessions.start(
      { activity: "other" },
      new Date("2026-10-07T06:00:00Z"),
    );
    if (brief.ok)
      await scope.studySessions.finish(brief.session.id, new Date("2026-10-07T06:00:30Z"));

    const progress = await scope.progress.summary(NOW);
    expect(progress.streak).toEqual({ current: 2, best: 2, studiedToday: false });
    expect(progress.week).toMatchObject({ studiedMinutes: 12, daysStudied: 2 });
    expect(progress.studyMinutes).toBe(42);

    await study(scope, "2026-10-07", 10);
    expect((await scope.progress.summary(NOW)).streak).toEqual({
      current: 3,
      best: 3,
      studiedToday: true,
    });
  });

  it("sets the weekly target from the user's own study time", async () => {
    const { scope } = await createOwner();
    await scope.planner.settings.setAvailability({ weekdayMinutes: 60, weekendMinutes: 120 });
    await study(scope, "2026-10-05", 270);
    const { week } = await scope.progress.summary(NOW);
    expect(week).toMatchObject({ targetMinutes: 540, studiedMinutes: 270, percent: 50 });
  });

  it("counts mastered flashcards by their scheduled interval, and course completion", async () => {
    const { user, course, lecture, scope } = await createOwner();
    const deck = first(
      await db
        .insert(flashcardDecks)
        .values({ userId: user.id, courseId: course.id, name: "Deck" })
        .returning(),
    );
    await db.insert(flashcards).values(
      [30, 21, 5].map((scheduledDays, index) => ({
        userId: user.id,
        deckId: deck.id,
        front: `F${index}`,
        back: `B${index}`,
        due: NOW,
        reps: 3,
        scheduledDays,
        state: "review" as const,
      })),
    );
    await scope.lectures.setCompleted(lecture.id, true);
    const progress = await scope.progress.summary(NOW);
    expect(progress.flashcards).toMatchObject({ cards: 3, mastered: 2 });
    expect(progress.courses).toEqual([
      expect.objectContaining({ id: course.id, lectures: 1, completed: 1 }),
    ]);
  });

  it("keeps each user's progress apart", async () => {
    const one = await createOwner();
    const two = await createOwner();
    await study(one.scope, "2026-10-07", 20);
    expect((await two.scope.progress.summary(NOW)).studyMinutes).toBe(0);
    const rows = await db
      .select()
      .from(flashcardDecks)
      .where(eq(flashcardDecks.userId, two.user.id));
    expect(rows).toEqual([]);
  });
});
