import type { CalendarItem, UserScope } from "@medos/database";
import { CURRENT_SEMESTER, addDays, isCourseId, zonedInstant } from "@medos/shared";

import { clockLabel, localParts } from "@/features/calendar/model";

import { TODAY_FIXTURE } from "./fixture";
import type { ClockTime, ScheduleEntry, TodayOverview } from "./types";

const ZONE = CURRENT_SEMESTER.timeZone;

/** Today's lectures, labs and course exams, in time order. Own events are not university activity. */
export function scheduleFrom(items: readonly CalendarItem[]): ScheduleEntry[] {
  return items.flatMap((item): ScheduleEntry[] => {
    const slug = item.course?.slug;
    if (item.allDay || !slug || !isCourseId(slug)) return [];
    const kind =
      item.type === "lecture" || item.type === "lab"
        ? item.type
        : item.exam || item.type === "exam" || item.type === "midterm"
          ? "exam"
          : null;
    if (!kind) return [];
    return [
      {
        id: item.id,
        courseId: slug,
        kind,
        start: clockLabel(localParts(item.startsAt, ZONE).minutes) as ClockTime,
        end: clockLabel(localParts(item.endsAt, ZONE).minutes) as ClockTime,
        location: item.location ?? undefined,
      },
    ];
  });
}

/**
 * The single seam between the Today screen and its data: the campus date and
 * time, the day's university schedule from the calendar, and the study time
 * from the study timer. The study plan is still the development fixture until
 * the study planner (Phase 15) provides it; the page does not need to change.
 */
export async function getTodayOverview(scope: UserScope, now = new Date()): Promise<TodayOverview> {
  const local = localParts(now, ZONE);
  const from = zonedInstant(local.date, "00:00", ZONE);
  const to = zonedInstant(addDays(local.date, 1), "00:00", ZONE);
  const [events, studied] = await Promise.all([
    scope.calendar.between(from, to),
    scope.studySessions.summary({ from, to }, now),
  ]);
  return {
    planSource: "fixture",
    date: local.date,
    time: clockLabel(local.minutes) as ClockTime,
    schedule: scheduleFrom(events),
    plan: TODAY_FIXTURE.plan,
    studiedMinutes: Math.floor(studied.totalSeconds / 60),
  };
}
