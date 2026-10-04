import type { CourseId } from "./courses";
import type { ClockTime } from "./zoned-time";

/*
 * The weekly university timetable, transcribed from the supplied
 * "EUC Medical School (3rd Year – 5th Semester / Fall 2026)" timetable
 * (S5/Calendars/F2026 - Year 3.pdf).
 *
 * Shared lectures are for everyone. Labs are taught in rotation: the groups
 * ("Sections: EC A" to "EC F") move between rooms in consecutive slots, so a
 * lab is recorded exactly as the grid shows it, one row per slot with the
 * group in each room. Every group is kept here, as in the source; only the
 * user's own group is ever put on their calendar (see `weeklySlots`).
 *
 * The "Independent Study" rows of the grid are not university sessions and
 * are not included.
 */

/** ISO weekday: 1 is Monday, 5 is Friday. */
export type Weekday = 1 | 2 | 3 | 4 | 5;

export const WEEKDAY_NAMES: Record<Weekday, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
};

export interface TimetableLecture {
  courseId: CourseId;
  weekday: Weekday;
  start: ClockTime;
  end: ClockTime;
  room: string;
}

export interface TimetableLab {
  courseId: CourseId;
  /** As the timetable names it, e.g. "Pathology Lab". */
  title: string;
  weekday: Weekday;
  /** The rooms of the rotation, in the order of `groups` in each slot. */
  rooms: readonly string[];
  slots: readonly { start: ClockTime; end: ClockTime; groups: readonly string[] }[];
}

export interface WeeklyTimetable {
  semesterId: string;
  lectures: readonly TimetableLecture[];
  labs: readonly TimetableLab[];
}

export const FALL_2026_TIMETABLE: WeeklyTimetable = {
  semesterId: "2026-fall",
  lectures: [
    { courseId: "pathophysiology", weekday: 1, start: "10:40", end: "13:10", room: "Sigma" },
    { courseId: "pharmacology", weekday: 2, start: "09:50", end: "12:20", room: "Sigma" },
    { courseId: "public-health", weekday: 3, start: "11:30", end: "14:50", room: "Sigma" },
    { courseId: "communication-skills", weekday: 3, start: "19:50", end: "20:40", room: "Sigma" },
    { courseId: "microbiology", weekday: 4, start: "10:40", end: "13:10", room: "Sigma" },
    { courseId: "pathology", weekday: 5, start: "10:40", end: "13:10", room: "Sigma" },
  ],
  labs: [
    {
      courseId: "pathophysiology",
      title: "Pathophysiology Lab",
      weekday: 1,
      rooms: ["TBL 1", "SIM 1 / Clinic", "SIM 2 / Skills lab 1"],
      slots: [
        { start: "14:00", end: "14:45", groups: ["A", "B", "C"] },
        { start: "14:45", end: "15:30", groups: ["B", "C", "A"] },
        { start: "15:30", end: "16:15", groups: ["C", "A", "B"] },
        { start: "16:15", end: "17:00", groups: ["D", "E", "F"] },
        { start: "17:00", end: "17:45", groups: ["E", "F", "D"] },
        { start: "17:45", end: "18:30", groups: ["F", "D", "E"] },
      ],
    },
    {
      courseId: "pharmacology",
      title: "Pharmacology Lab",
      weekday: 2,
      rooms: ["SIM 1", "SIM 2 / Clinic", "TBL 1 / CAL 1 / Skills lab 1"],
      slots: [
        { start: "13:30", end: "14:15", groups: ["D", "E", "F"] },
        { start: "14:15", end: "15:00", groups: ["E", "F", "D"] },
        { start: "15:00", end: "15:45", groups: ["F", "D", "E"] },
        { start: "15:45", end: "16:30", groups: ["A", "B", "C"] },
        { start: "16:30", end: "17:15", groups: ["B", "C", "A"] },
        { start: "17:15", end: "18:00", groups: ["C", "A", "B"] },
      ],
    },
    {
      courseId: "communication-skills",
      title: "Communication Skills Lab",
      weekday: 3,
      rooms: ["TBL 1", "TBL 2"],
      slots: [
        { start: "16:30", end: "17:30", groups: ["A", "B"] },
        { start: "17:30", end: "18:30", groups: ["C", "D"] },
        { start: "18:30", end: "19:30", groups: ["E", "F"] },
      ],
    },
    {
      courseId: "microbiology",
      title: "Medical Microbiology Lab",
      weekday: 4,
      rooms: ["Histo / Microbio Lab", "TBL 2"],
      slots: [
        { start: "14:00", end: "14:45", groups: ["E", "F"] },
        { start: "14:45", end: "15:30", groups: ["F", "E"] },
        { start: "15:30", end: "16:15", groups: ["D", "C"] },
        { start: "16:15", end: "17:00", groups: ["C", "D"] },
        { start: "17:00", end: "17:45", groups: ["A", "B"] },
        { start: "17:45", end: "18:30", groups: ["B", "A"] },
      ],
    },
    {
      courseId: "pathology",
      title: "Pathology Lab",
      weekday: 5,
      rooms: ["Histo / Microbio Lab", "Sectra", "TBL 1"],
      slots: [
        { start: "14:00", end: "14:45", groups: ["A", "B", "C"] },
        { start: "14:45", end: "15:30", groups: ["C", "A", "B"] },
        { start: "15:30", end: "16:15", groups: ["B", "C", "A"] },
        { start: "16:15", end: "17:00", groups: ["D", "E", "F"] },
        { start: "17:00", end: "17:45", groups: ["F", "D", "E"] },
        { start: "17:45", end: "18:30", groups: ["E", "F", "D"] },
      ],
    },
  ],
};

/** One weekly session of the user's timetable. */
export interface WeeklySlot {
  /** Stable within the timetable, e.g. "lab-pathology-5-14:00". */
  key: string;
  kind: "lecture" | "lab";
  courseId: CourseId;
  /** The lab's own name; null for a lecture, which is named after its course. */
  title: string | null;
  weekday: Weekday;
  start: ClockTime;
  end: ClockTime;
  room: string;
  /** The lab group; null for a shared lecture. */
  group: string | null;
}

/**
 * The weekly sessions of one lab group: every shared lecture, and only that
 * group's lab slots. Other groups' labs are never returned.
 */
export function weeklySlots(timetable: WeeklyTimetable, group: string): WeeklySlot[] {
  const lectures = timetable.lectures.map((lecture): WeeklySlot => ({
    key: `lecture-${lecture.courseId}-${lecture.weekday}-${lecture.start}`,
    kind: "lecture",
    courseId: lecture.courseId,
    title: null,
    weekday: lecture.weekday,
    start: lecture.start,
    end: lecture.end,
    room: lecture.room,
    group: null,
  }));
  const labs = timetable.labs.flatMap((lab) =>
    lab.slots.flatMap((slot): WeeklySlot[] => {
      const position = slot.groups.indexOf(group);
      const room = lab.rooms[position];
      if (position < 0 || room === undefined) return [];
      return [
        {
          key: `lab-${lab.courseId}-${lab.weekday}-${slot.start}`,
          kind: "lab",
          courseId: lab.courseId,
          title: lab.title,
          weekday: lab.weekday,
          start: slot.start,
          end: slot.end,
          room,
          group,
        },
      ];
    }),
  );
  return [...lectures, ...labs].sort(
    (a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start),
  );
}
