import type { UserScope } from "@medos/database";

import { startOfDay } from "@/features/flashcards/logic";

import { TODAY_FIXTURE } from "./fixture";
import type { TodayOverview } from "./types";

/**
 * The single seam between the Today screen and its data. The schedule and
 * plan are still the development fixture until the timetable (Phase 14) and
 * study planner (Phase 15) provide them; the page does not need to change.
 * Study time is real: the user's active timed study since midnight.
 */
export async function getTodayOverview(scope: UserScope, now = new Date()): Promise<TodayOverview> {
  const from = startOfDay(now);
  const studied = await scope.studySessions.summary(
    // Tomorrow's midnight, found from 36 hours on, so a 23- or 25-hour day is still one day.
    { from, to: startOfDay(new Date(from.getTime() + 36 * 60 * 60 * 1000)) },
    now,
  );
  return { ...TODAY_FIXTURE, studiedMinutes: Math.floor(studied.totalSeconds / 60) };
}
