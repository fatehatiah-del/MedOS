import "server-only";

import type { CalendarItem, StudiedItem, UserScope } from "@medos/database";
import {
  CURRENT_SEMESTER,
  type DateRange,
  type IsoDate,
  addDays,
  zonedInstant,
} from "@medos/shared";

import { ACTIVITY_LABELS } from "@/features/timer/clock";

import { EVENT_TYPE_LABELS } from "./event-types";
import {
  type CalendarView,
  clockLabel,
  daysOf,
  localParts,
  shiftAnchor,
  viewTitle,
  visibleRange,
} from "./model";

/** An event as the calendar shows it, in campus wall-clock time. */
export interface DisplayEvent {
  id: string;
  title: string;
  type: CalendarItem["type"];
  typeLabel: string;
  origin: CalendarItem["origin"];
  /** Imported from the university calendar: read-only apart from notes. */
  imported: boolean;
  examKind: "midterm" | "final" | "other" | null;
  allDay: boolean;
  date: IsoDate;
  /** Inclusive last day. */
  endDate: IsoDate;
  startMinutes: number;
  endMinutes: number;
  start: string;
  end: string;
  location: string | null;
  notes: string | null;
  studentGroup: string | null;
  course: {
    id: string;
    slug: string;
    name: string;
    shortName: string;
    colorToken: string | null;
  } | null;
}

/** A finished stretch of timed study. */
export interface DisplayStudy {
  id: string;
  date: IsoDate;
  startMinutes: number;
  endMinutes: number;
  start: string;
  end: string;
  label: string;
  activeMinutes: number;
  colorToken: string | null;
}

export interface CalendarData {
  view: CalendarView;
  anchor: IsoDate;
  today: IsoDate;
  range: DateRange;
  days: IsoDate[];
  title: string;
  previous: IsoDate;
  next: IsoDate;
  events: DisplayEvent[];
  studied: DisplayStudy[];
}

const ZONE = CURRENT_SEMESTER.timeZone;

export function toDisplayEvent(item: CalendarItem): DisplayEvent {
  const start = localParts(item.startsAt, ZONE);
  const end = localParts(item.endsAt, ZONE);
  // All-day events end at midnight after their last day.
  const endDate = item.allDay ? addDays(end.date, -1) : end.date;
  const endMinutes = !item.allDay && end.date !== start.date ? 24 * 60 : end.minutes;
  return {
    id: item.id,
    title: item.title,
    type: item.type,
    typeLabel: item.exam
      ? item.exam.kind === "midterm"
        ? "Midterm exam"
        : item.exam.kind === "final"
          ? "Final exam"
          : "Exam"
      : EVENT_TYPE_LABELS[item.type],
    origin: item.origin,
    imported: item.imported,
    examKind: item.exam?.kind ?? null,
    allDay: item.allDay,
    date: start.date,
    endDate: endDate < start.date ? start.date : endDate,
    startMinutes: start.minutes,
    endMinutes,
    start: clockLabel(start.minutes),
    end: clockLabel(endMinutes === 24 * 60 ? 0 : endMinutes),
    location: item.location,
    notes: item.notes,
    studentGroup: item.studentGroup,
    course: item.course,
  };
}

export function toDisplayStudy(item: StudiedItem): DisplayStudy {
  const start = localParts(item.startedAt, ZONE);
  const end = localParts(item.endedAt, ZONE);
  const endMinutes = end.date !== start.date ? 24 * 60 : Math.max(end.minutes, start.minutes);
  const activity = ACTIVITY_LABELS[item.activity];
  const context = item.lecture?.title ?? item.course?.shortName;
  return {
    id: item.id,
    date: start.date,
    startMinutes: start.minutes,
    endMinutes,
    start: clockLabel(start.minutes),
    end: clockLabel(endMinutes === 24 * 60 ? 0 : endMinutes),
    label: context ? `${activity} · ${context}` : activity,
    activeMinutes: Math.floor(item.activeSeconds / 60),
    colorToken: item.course?.colorToken ?? null,
  };
}

/** The campus calendar day of `now`. */
export function campusToday(now = new Date()): IsoDate {
  return localParts(now, ZONE).date;
}

/** Everything a calendar view needs, from the user's own data. */
export async function loadCalendar(
  scope: UserScope,
  view: CalendarView,
  anchor: IsoDate,
  today: IsoDate,
): Promise<CalendarData> {
  const range = visibleRange(view, anchor);
  const from = zonedInstant(range.start, "00:00", ZONE);
  const to = zonedInstant(addDays(range.end, 1), "00:00", ZONE);
  const [events, studied] = await Promise.all([
    scope.calendar.between(from, to),
    scope.calendar.studiedBetween(from, to),
  ]);
  return {
    view,
    anchor,
    today,
    range,
    days: daysOf(range),
    title: viewTitle(view, anchor, range),
    previous: shiftAnchor(view, anchor, -1),
    next: shiftAnchor(view, anchor, 1),
    events: events.map(toDisplayEvent),
    studied: studied.map(toDisplayStudy),
  };
}
