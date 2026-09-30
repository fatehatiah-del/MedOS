/**
 * Calendar-date helpers.
 *
 * Academic dates are calendar days, not instants, so they are handled as
 * `YYYY-MM-DD` strings and computed in UTC. This keeps week numbers and
 * countdowns independent of the server or browser time zone.
 */
export type IsoDate = `${number}-${number}-${number}`;

/** An inclusive range of calendar days. */
export interface DateRange {
  start: IsoDate;
  end: IsoDate;
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function isIsoDate(value: string): value is IsoDate {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  // Reject overflow dates such as 2026-02-31.
  return date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day);
}

function toUtcMs(date: IsoDate): number {
  if (!isIsoDate(date)) {
    throw new Error(`Invalid ISO date: ${date}`);
  }
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return Date.UTC(year, month - 1, day);
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

export function isWithinRange(date: IsoDate, range: DateRange): boolean {
  return daysBetween(range.start, date) >= 0 && daysBetween(date, range.end) >= 0;
}

export function isWeekend(date: IsoDate): boolean {
  const weekday = new Date(toUtcMs(date)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

interface DateFormatOptions {
  weekday?: boolean;
  year?: boolean;
  locale?: string;
}

/** Formats a calendar day, e.g. "30 September" or "Wednesday, 30 September 2026". */
export function formatDate(date: IsoDate, options: DateFormatOptions = {}): string {
  const { weekday = false, year = false, locale = "en-GB" } = options;
  const instant = new Date(toUtcMs(date));
  const dayAndMonth = new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    ...(year ? { year: "numeric" } : {}),
  }).format(instant);
  if (!weekday) return dayAndMonth;
  // Joined explicitly so the separator does not vary between ICU versions.
  const weekdayName = new Intl.DateTimeFormat(locale, { timeZone: "UTC", weekday: "long" }).format(
    instant,
  );
  return `${weekdayName}, ${dayAndMonth}`;
}

/** Formats an inclusive range, e.g. "12–18 November 2026" or "28 September 2026 – 29 January 2027". */
export function formatDateRange(range: DateRange, locale = "en-GB"): string {
  const [startYear, startMonth] = range.start.split("-");
  const [endYear, endMonth] = range.end.split("-");
  if (startYear === endYear && startMonth === endMonth) {
    const startDay = Number(range.start.split("-")[2]);
    return `${startDay}–${formatDate(range.end, { year: true, locale })}`;
  }
  return `${formatDate(range.start, { year: true, locale })} – ${formatDate(range.end, { year: true, locale })}`;
}

/** The calendar day `days` after `date` (or before it, when negative). */
export function addDays(date: IsoDate, days: number): IsoDate {
  return new Date(toUtcMs(date) + days * MS_PER_DAY).toISOString().slice(0, 10) as IsoDate;
}
