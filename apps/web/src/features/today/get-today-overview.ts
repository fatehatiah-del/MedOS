import { TODAY_FIXTURE } from "./fixture";
import type { TodayOverview } from "./types";

/**
 * The single seam between the Today screen and its data. It returns the
 * development fixture until the timetable (Phase 14) and study planner
 * (Phase 15) provide database-backed data; the page does not need to change.
 */
export async function getTodayOverview(): Promise<TodayOverview> {
  return TODAY_FIXTURE;
}
