import { createHash } from "node:crypto";

import {
  FALL_2026,
  type SemesterDefinition,
  type UniversityEvent,
  universityEvents,
} from "@medos/shared";
import { and, eq, like, notInArray } from "drizzle-orm";

import type { Database } from "../client";
import { type Semester, calendarEvents, courses, semesters } from "../schema";

import { overwriteWhenChanged } from "./upsert";

/*
 * Puts the university calendar on a user's calendar: the shared lectures and
 * the user's own lab group's labs on every teaching day, and the academic
 * dates, all generated from the transcribed data in `@medos/shared`.
 *
 * Imported events are matched on their source key, so importing again
 * creates nothing new and changes only what the data changed. The user's own
 * notes on an imported event are never overwritten. An imported event that is
 * no longer in the data (a corrected transcription) is removed; events the
 * user created are never touched.
 */

/** Semester definitions whose university calendar MedOS knows. */
const DEFINITIONS: readonly SemesterDefinition[] = [FALL_2026];

const versions = new Map<string, { version: string; events: UniversityEvent[] }>();

/** The semester's university events and their fingerprint, computed once per process. */
export function universityCalendarFor(
  slug: string,
): { version: string; events: UniversityEvent[] } | null {
  const cached = versions.get(slug);
  if (cached) return cached;
  const definition = DEFINITIONS.find((candidate) => candidate.id === slug);
  if (!definition) return null;
  const events = universityEvents(definition);
  const version = createHash("sha256").update(JSON.stringify(events)).digest("hex").slice(0, 16);
  const entry = { version, events };
  versions.set(slug, entry);
  return entry;
}

export interface CalendarImportResult {
  version: string;
  events: number;
  removed: number;
}

const BATCH = 200;

export async function importUniversityCalendar(
  db: Database,
  semester: Semester,
): Promise<CalendarImportResult | null> {
  const calendar = universityCalendarFor(semester.slug);
  if (!calendar) return null;
  const { version, events } = calendar;
  const userId = semester.userId;

  return db.transaction(async (tx) => {
    const owned = await tx
      .select({ id: courses.id, slug: courses.slug })
      .from(courses)
      .where(and(eq(courses.semesterId, semester.id), eq(courses.userId, userId)));
    const courseIds = new Map(owned.map((course) => [course.slug, course.id]));

    const rows = events.map((event) => ({
      userId,
      courseId: event.courseId ? (courseIds.get(event.courseId) ?? null) : null,
      type: event.type,
      origin: "university" as const,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      allDay: event.allDay,
      timezone: event.timezone,
      location: event.location,
      studentGroup: event.studentGroup,
      sourceKey: event.sourceKey,
    }));

    for (let index = 0; index < rows.length; index += BATCH) {
      await tx
        .insert(calendarEvents)
        .values(rows.slice(index, index + BATCH))
        .onConflictDoUpdate({
          target: [calendarEvents.userId, calendarEvents.sourceKey],
          // Everything that comes from the source; never the user's notes.
          ...overwriteWhenChanged({
            courseId: calendarEvents.courseId,
            type: calendarEvents.type,
            origin: calendarEvents.origin,
            title: calendarEvents.title,
            startsAt: calendarEvents.startsAt,
            endsAt: calendarEvents.endsAt,
            allDay: calendarEvents.allDay,
            timezone: calendarEvents.timezone,
            location: calendarEvents.location,
            studentGroup: calendarEvents.studentGroup,
          }),
        });
    }

    const removed = await tx
      .delete(calendarEvents)
      .where(
        and(
          eq(calendarEvents.userId, userId),
          like(calendarEvents.sourceKey, `${semester.slug}:%`),
          notInArray(
            calendarEvents.sourceKey,
            events.map((event) => event.sourceKey),
          ),
        ),
      )
      .returning({ id: calendarEvents.id });

    await tx
      .update(semesters)
      .set({ calendarVersion: version })
      .where(and(eq(semesters.id, semester.id), eq(semesters.userId, userId)));

    return { version, events: rows.length, removed: removed.length };
  });
}
