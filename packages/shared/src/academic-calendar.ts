import { COURSES, type CourseId } from "./courses";
import { type DateRange, type IsoDate, addDays, daysBetween, isWithinRange } from "./dates";
import { FALL_2026, type SemesterDefinition } from "./semester";
import { FALL_2026_TIMETABLE, type Weekday, type WeeklyTimetable, weeklySlots } from "./timetable";
import { zonedInstant } from "./zoned-time";

/*
 * The academic calendar of the semester, transcribed from the university's
 * "Academic Calendar 2026-27, Medicine, Years 1, 2, 3"
 * (S5/Calendars/current_frankfurt_medicine.pdf), Fall 2026 page.
 *
 * The midterm period (12–18 November 2026) is not printed on that calendar;
 * its dates come from the user, who confirmed there is no teaching during it.
 */

export type AcademicDateKind = "holiday" | "academic-deadline" | "midterm" | "exam";

/** A dated item of the academic calendar: a holiday, deadline or exam period. */
export interface AcademicDate {
  /** Stable within the calendar, e.g. "winter-holidays". */
  key: string;
  kind: AcademicDateKind;
  title: string;
  range: DateRange;
}

export interface AcademicCalendar {
  semesterId: string;
  /** Periods in which the weekly timetable is taught (weekdays only). */
  instruction: readonly DateRange[];
  /** Days inside `instruction` with no teaching, and why. */
  noTeaching: readonly { range: DateRange; reason: string }[];
  dates: readonly AcademicDate[];
}

const day = (date: IsoDate): DateRange => ({ start: date, end: date });

export const FALL_2026_ACADEMIC_CALENDAR: AcademicCalendar = {
  semesterId: "2026-fall",
  instruction: [
    // Opening day of instruction to the last day before the winter holidays.
    { start: "2026-09-28", end: "2026-12-18" },
    // Opening day after the winter holidays to the last day of instruction.
    { start: "2027-01-07", end: "2027-01-15" },
  ],
  noTeaching: [
    { range: day("2026-10-01"), reason: "Public holiday" },
    { range: day("2026-10-28"), reason: "Public holiday" },
    { range: FALL_2026.midterms, reason: "Midterm period" },
  ],
  dates: [
    {
      key: "first-day",
      kind: "academic-deadline",
      title: "First day of instruction",
      range: day("2026-09-28"),
    },
    {
      key: "public-holiday-1-oct",
      kind: "holiday",
      title: "Public holiday",
      range: day("2026-10-01"),
    },
    {
      key: "add-drop",
      kind: "academic-deadline",
      title: "Last day to add/drop a course",
      range: day("2026-10-09"),
    },
    {
      key: "public-holiday-28-oct",
      kind: "holiday",
      title: "Public holiday",
      range: day("2026-10-28"),
    },
    { key: "midterms", kind: "midterm", title: "Midterm period", range: FALL_2026.midterms },
    {
      key: "withdraw",
      kind: "academic-deadline",
      title: "Last day to withdraw from a course",
      range: day("2026-12-04"),
    },
    {
      key: "feedback-survey",
      kind: "academic-deadline",
      title: "Survey: Students' Feedback on Their Learning Experience",
      range: { start: "2026-12-14", end: "2027-01-15" },
    },
    {
      key: "last-day-before-winter",
      kind: "academic-deadline",
      title: "Last day of instruction before the winter holidays",
      range: day("2026-12-18"),
    },
    {
      key: "winter-holidays",
      kind: "holiday",
      title: "Winter holidays",
      range: { start: "2026-12-21", end: "2027-01-06" },
    },
    {
      key: "first-day-after-winter",
      kind: "academic-deadline",
      title: "First day of instruction after the winter holidays",
      range: day("2027-01-07"),
    },
    {
      key: "last-day",
      kind: "academic-deadline",
      title: "Last day of instruction",
      range: day("2027-01-15"),
    },
    { key: "finals", kind: "exam", title: "Final examination period", range: FALL_2026.finals },
    {
      key: "semester-end",
      kind: "academic-deadline",
      title: "End of Fall Semester 2026",
      range: day("2027-01-29"),
    },
  ],
};

/** ISO weekday of a calendar day: 1 for Monday to 7 for Sunday. */
function isoWeekday(date: IsoDate): number {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

/** Every weekday on which the timetable is taught, in order. */
export function teachingDays(calendar: AcademicCalendar): IsoDate[] {
  const days: IsoDate[] = [];
  for (const period of calendar.instruction) {
    for (let date = period.start; daysBetween(date, period.end) >= 0; date = addDays(date, 1)) {
      if (isoWeekday(date) > 5) continue;
      if (calendar.noTeaching.some(({ range }) => isWithinRange(date, range))) continue;
      days.push(date);
    }
  }
  return days;
}

/** A university event of the user's calendar, ready to store. */
export interface UniversityEvent {
  /** Stable across imports, so importing again updates instead of duplicating. */
  sourceKey: string;
  type: "lecture" | "lab" | AcademicDateKind;
  courseId: CourseId | null;
  title: string;
  startsAt: Date;
  /** Exclusive: an all-day event ends at midnight after its last day. */
  endsAt: Date;
  allDay: boolean;
  timezone: string;
  location: string | null;
  studentGroup: string | null;
}

/**
 * The university calendar of one lab group for the semester: every shared
 * lecture and the group's labs on every teaching day, and the academic dates.
 * Times are wall-clock times on the campus, turned into instants.
 */
export function universityEvents(
  semester: SemesterDefinition = FALL_2026,
  timetable: WeeklyTimetable = FALL_2026_TIMETABLE,
  calendar: AcademicCalendar = FALL_2026_ACADEMIC_CALENDAR,
): UniversityEvent[] {
  const zone = semester.timeZone;
  const slots = weeklySlots(timetable, semester.group);
  const courseName = (id: CourseId) => COURSES.find((course) => course.id === id)?.name ?? id;

  const sessions = teachingDays(calendar).flatMap((date) =>
    slots
      .filter((slot) => slot.weekday === (isoWeekday(date) as Weekday))
      .map((slot): UniversityEvent => ({
        sourceKey: `${semester.id}:${slot.key}@${date}`,
        type: slot.kind,
        courseId: slot.courseId,
        title: slot.title ?? courseName(slot.courseId),
        startsAt: zonedInstant(date, slot.start, zone),
        endsAt: zonedInstant(date, slot.end, zone),
        allDay: false,
        timezone: zone,
        location: slot.room,
        studentGroup: slot.group,
      })),
  );

  const dates = calendar.dates.map((item): UniversityEvent => ({
    sourceKey: `${semester.id}:date-${item.key}`,
    type: item.kind,
    courseId: null,
    title: item.title,
    startsAt: zonedInstant(item.range.start, "00:00", zone),
    endsAt: zonedInstant(addDays(item.range.end, 1), "00:00", zone),
    allDay: true,
    timezone: zone,
    location: null,
    studentGroup: null,
  }));

  return [...dates, ...sessions];
}
