import { type IsoDate, isWeekend } from "./dates";

export interface StudyAvailability {
  weekdayMinutes: number;
  weekendMinutes: number;
}

/** Defaults from the specification: 2.5 h on weekdays, 4 h on weekends. User-editable later. */
export const DEFAULT_STUDY_AVAILABILITY: StudyAvailability = {
  weekdayMinutes: 150,
  weekendMinutes: 240,
};

export function availableMinutesFor(
  date: IsoDate,
  availability: StudyAvailability = DEFAULT_STUDY_AVAILABILITY,
): number {
  return isWeekend(date) ? availability.weekendMinutes : availability.weekdayMinutes;
}

/** Formats a duration in minutes as "45m", "2h" or "1h 20m". */
export function formatMinutes(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) {
    throw new Error(`Invalid duration: ${totalMinutes}`);
  }
  const rounded = Math.round(totalMinutes);
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}
