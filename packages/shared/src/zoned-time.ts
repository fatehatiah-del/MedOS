import type { IsoDate } from "./dates";

/** Wall-clock time, 24-hour, e.g. "09:50". */
export type ClockTime = `${number}:${number}`;

const CLOCK_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isClockTime(value: string): value is ClockTime {
  return CLOCK_PATTERN.test(value);
}

/** Minutes from midnight of a clock time: "09:50" is 590. */
export function clockMinutes(time: ClockTime): number {
  const match = CLOCK_PATTERN.exec(time);
  if (!match) throw new Error(`Invalid clock time: ${time}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** How far `timeZone` is ahead of UTC at `instant`, in milliseconds. */
function offsetAt(instant: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>;
  const wall = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return wall - Math.floor(instant / 1000) * 1000;
}

/**
 * The instant at which the clocks in `timeZone` show `time` on `date`, for
 * example 10:40 in Frankfurt on 26 October 2026 (09:40 UTC, after the switch
 * to winter time). University times are wall-clock times in the campus zone.
 */
export function zonedInstant(date: IsoDate, time: ClockTime, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const wall = Date.UTC(year, month - 1, day) + clockMinutes(time) * 60_000;
  // The offset at the guessed instant, corrected once if the guess fell across a change.
  const first = wall - offsetAt(wall, timeZone);
  const second = wall - offsetAt(first, timeZone);
  return new Date(second);
}

/** The calendar day it is in `timeZone` at `instant`. */
export function zonedDate(instant: Date, timeZone: string): IsoDate {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  ) as Record<"year" | "month" | "day", string>;
  return `${parts.year}-${parts.month}-${parts.day}` as IsoDate;
}
