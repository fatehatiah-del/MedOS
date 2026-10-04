import {
  CURRENT_SEMESTER,
  type DateRange,
  type IsoDate,
  addDays,
  daysBetween,
  isIsoDate,
} from "@medos/shared";

/*
 * The calendar's views as pure functions: which days a view shows, how to
 * move between periods, and where events sit on a day. Everything works in
 * campus wall-clock time (calendar days and minutes from midnight), which the
 * server derives from stored instants, so the browser's own time zone never
 * moves an event.
 */

export const CALENDAR_VIEW_IDS = ["day", "week", "month", "semester"] as const;
export type CalendarView = (typeof CALENDAR_VIEW_IDS)[number];

/** Hours a day or week view always shows; widened when an event falls outside. */
export const DEFAULT_HOURS = { start: 8, end: 21 } as const;

const UTC_DAY = (date: IsoDate) => new Date(`${date}T00:00:00Z`);

/** ISO weekday: 1 is Monday, 7 is Sunday. */
export function isoWeekday(date: IsoDate): number {
  const day = UTC_DAY(date).getUTCDay();
  return day === 0 ? 7 : day;
}

export function startOfWeek(date: IsoDate): IsoDate {
  return addDays(date, 1 - isoWeekday(date));
}

function firstOfMonth(date: IsoDate): IsoDate {
  return `${date.slice(0, 8)}01` as IsoDate;
}

function addMonths(date: IsoDate, months: number): IsoDate {
  const instant = UTC_DAY(firstOfMonth(date));
  instant.setUTCMonth(instant.getUTCMonth() + months);
  return instant.toISOString().slice(0, 10) as IsoDate;
}

function lastOfMonth(date: IsoDate): IsoDate {
  return addDays(addMonths(date, 1), -1);
}

/** The view and day asked for in the address, or sensible defaults. */
export function parseCalendarQuery(
  query: { view?: string | string[]; date?: string | string[] },
  today: IsoDate,
): { view: CalendarView; anchor: IsoDate } {
  const view = Array.isArray(query.view) ? query.view[0] : query.view;
  const date = Array.isArray(query.date) ? query.date[0] : query.date;
  return {
    view: CALENDAR_VIEW_IDS.includes(view as CalendarView) ? (view as CalendarView) : "week",
    anchor: date && isIsoDate(date) ? date : today,
  };
}

/** The days a view shows, inclusive. A month shows whole weeks around it. */
export function visibleRange(
  view: CalendarView,
  anchor: IsoDate,
  term: DateRange = CURRENT_SEMESTER.term,
): DateRange {
  switch (view) {
    case "day":
      return { start: anchor, end: anchor };
    case "week": {
      const start = startOfWeek(anchor);
      return { start, end: addDays(start, 6) };
    }
    case "month": {
      const start = startOfWeek(firstOfMonth(anchor));
      const end = addDays(startOfWeek(lastOfMonth(anchor)), 6);
      return { start, end };
    }
    case "semester":
      return { start: startOfWeek(term.start), end: addDays(startOfWeek(term.end), 6) };
  }
}

/** The day to show after moving one period back (-1) or forward (+1). */
export function shiftAnchor(view: CalendarView, anchor: IsoDate, direction: -1 | 1): IsoDate {
  switch (view) {
    case "day":
      return addDays(anchor, direction);
    case "week":
      return addDays(anchor, 7 * direction);
    case "month":
      return addMonths(anchor, direction);
    case "semester":
      return anchor;
  }
}

export function daysOf(range: DateRange): IsoDate[] {
  const days: IsoDate[] = [];
  for (let day = range.start; daysBetween(day, range.end) >= 0; day = addDays(day, 1)) {
    days.push(day);
  }
  return days;
}

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const DAY_LONG = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const DAY_SHORT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** The heading of a view: "Monday 5 October 2026", "5 – 11 Oct 2026", "October 2026". */
export function viewTitle(view: CalendarView, anchor: IsoDate, range: DateRange): string {
  switch (view) {
    case "day":
      return DAY_LONG.format(UTC_DAY(anchor));
    case "week":
      return `${DAY_SHORT.format(UTC_DAY(range.start))} – ${DAY_SHORT.format(UTC_DAY(range.end))} ${range.end.slice(0, 4)}`;
    case "month":
      return MONTH.format(UTC_DAY(anchor));
    case "semester":
      return `${CURRENT_SEMESTER.label} · ${CURRENT_SEMESTER.name}`;
  }
}

/** A calendar day and minutes from midnight, as the clocks show them in `timeZone`. */
export function localParts(instant: Date, timeZone: string): { date: IsoDate; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  ) as Record<"year" | "month" | "day" | "hour" | "minute", string>;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}` as IsoDate,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export function clockLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Something placed on a day at a time: an event or a stretch of study. */
export interface TimedBlock {
  id: string;
  date: IsoDate;
  startMinutes: number;
  endMinutes: number;
}

/**
 * Side-by-side positions for overlapping blocks of one day: each block gets a
 * column, and every block in a group of overlapping ones knows how many
 * columns the group uses.
 */
export function layoutDay<T extends TimedBlock>(
  blocks: readonly T[],
): { block: T; column: number; columns: number }[] {
  const sorted = [...blocks].sort(
    (a, b) => a.startMinutes - b.startMinutes || b.endMinutes - a.endMinutes,
  );
  const placed: { block: T; column: number; columns: number }[] = [];
  let group: { block: T; column: number; columns: number }[] = [];
  let groupEnd = -1;
  const close = () => {
    const columns = Math.max(0, ...group.map((entry) => entry.column)) + 1;
    for (const entry of group) entry.columns = columns;
    placed.push(...group);
    group = [];
  };
  for (const block of sorted) {
    if (group.length > 0 && block.startMinutes >= groupEnd) close();
    const taken = new Set(
      group.filter((entry) => entry.block.endMinutes > block.startMinutes).map((e) => e.column),
    );
    let column = 0;
    while (taken.has(column)) column += 1;
    group.push({ block, column, columns: 1 });
    groupEnd = Math.max(groupEnd, block.endMinutes);
  }
  if (group.length > 0) close();
  return placed;
}

/** The hours a day or week grid shows: the default, widened to fit every block. */
export function hourBounds(blocks: readonly TimedBlock[]): { start: number; end: number } {
  let start: number = DEFAULT_HOURS.start;
  let end: number = DEFAULT_HOURS.end;
  for (const block of blocks) {
    start = Math.min(start, Math.floor(block.startMinutes / 60));
    end = Math.max(end, Math.ceil(block.endMinutes / 60));
  }
  return { start: Math.max(0, start), end: Math.min(24, end) };
}

/**
 * Whether an all-day item is drawn on `day`. Holidays and exam periods fill
 * every day they cover, so the period is visible at a glance. A dated item
 * spanning several days (such as a feedback survey) is drawn once, on its
 * first day in view, so it does not crowd out the timetable.
 */
export function allDayOn(
  event: { allDay: boolean; type: string; date: IsoDate; endDate: IsoDate },
  day: IsoDate,
  firstVisible: IsoDate,
): boolean {
  if (!event.allDay || event.date > day || event.endDate < day) return false;
  if (event.type !== "academic-deadline" || event.date === event.endDate) return true;
  return day === (event.date > firstVisible ? event.date : firstVisible);
}
