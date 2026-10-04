import { describe, expect, it } from "vitest";

import {
  FALL_2026,
  FALL_2026_ACADEMIC_CALENDAR,
  FALL_2026_TIMETABLE,
  type IsoDate,
  teachingDays,
  universityEvents,
  weeklySlots,
  zonedInstant,
} from "./index";

/*
 * The transcribed Fall 2026 timetable and academic calendar, as they will
 * land on the user's calendar: Group A only, no teaching on holidays or in
 * the midterm period, and campus wall-clock times across the change of time.
 */

describe("zonedInstant", () => {
  it("turns Frankfurt wall-clock time into an instant on both sides of the time change", () => {
    // Summer time (UTC+2) until 25 October 2026, winter time (UTC+1) after.
    expect(zonedInstant("2026-10-19", "10:40", "Europe/Berlin").toISOString()).toBe(
      "2026-10-19T08:40:00.000Z",
    );
    expect(zonedInstant("2026-10-26", "10:40", "Europe/Berlin").toISOString()).toBe(
      "2026-10-26T09:40:00.000Z",
    );
    expect(zonedInstant("2027-01-07", "00:00", "Europe/Berlin").toISOString()).toBe(
      "2027-01-06T23:00:00.000Z",
    );
  });
});

describe("weeklySlots", () => {
  const groupA = weeklySlots(FALL_2026_TIMETABLE, "A");

  it("keeps every shared lecture", () => {
    const lectures = groupA.filter((slot) => slot.kind === "lecture");
    expect(lectures.map((slot) => [slot.courseId, slot.weekday, slot.start, slot.end])).toEqual([
      ["pathophysiology", 1, "10:40", "13:10"],
      ["pharmacology", 2, "09:50", "12:20"],
      ["public-health", 3, "11:30", "14:50"],
      ["communication-skills", 3, "19:50", "20:40"],
      ["microbiology", 4, "10:40", "13:10"],
      ["pathology", 5, "10:40", "13:10"],
    ]);
    expect(lectures.every((slot) => slot.group === null && slot.room === "Sigma")).toBe(true);
  });

  it("keeps only Group A's labs, in the right rooms", () => {
    const labs = groupA.filter((slot) => slot.kind === "lab");
    expect(labs.map((slot) => [slot.weekday, slot.start, slot.end, slot.room])).toEqual([
      [1, "14:00", "14:45", "TBL 1"],
      [1, "14:45", "15:30", "SIM 2 / Skills lab 1"],
      [1, "15:30", "16:15", "SIM 1 / Clinic"],
      [2, "15:45", "16:30", "SIM 1"],
      [2, "16:30", "17:15", "TBL 1 / CAL 1 / Skills lab 1"],
      [2, "17:15", "18:00", "SIM 2 / Clinic"],
      [3, "16:30", "17:30", "TBL 1"],
      [4, "17:00", "17:45", "Histo / Microbio Lab"],
      [4, "17:45", "18:30", "TBL 2"],
      [5, "14:00", "14:45", "Histo / Microbio Lab"],
      [5, "14:45", "15:30", "Sectra"],
      [5, "15:30", "16:15", "TBL 1"],
    ]);
    expect(labs.every((slot) => slot.group === "A")).toBe(true);
  });

  it("gives other groups their own labs, never Group A's", () => {
    const groupD = weeklySlots(FALL_2026_TIMETABLE, "D").filter((slot) => slot.kind === "lab");
    expect(groupD.every((slot) => slot.group === "D")).toBe(true);
    expect(groupD.find((slot) => slot.weekday === 2)?.start).toBe("13:30");
    expect(weeklySlots(FALL_2026_TIMETABLE, "Z").filter((slot) => slot.kind === "lab")).toEqual([]);
  });

  it("has every group exactly once per lab slot", () => {
    for (const lab of FALL_2026_TIMETABLE.labs) {
      const groups = lab.slots.flatMap((slot) => {
        expect(slot.groups).toHaveLength(lab.rooms.length);
        return slot.groups;
      });
      expect([...groups].sort()).toEqual(
        ["A", "B", "C", "D", "E", "F"].flatMap((group) =>
          Array.from({ length: groups.length / 6 }, () => group),
        ),
      );
    }
  });
});

describe("teachingDays", () => {
  const days = teachingDays(FALL_2026_ACADEMIC_CALENDAR);

  it("covers the weekdays of instruction, from opening day to the last day", () => {
    expect(days).toHaveLength(60);
    expect(days[0]).toBe("2026-09-28");
    expect(days.at(-1)).toBe("2027-01-15");
    expect(days).toContain("2026-12-18");
    expect(days).toContain("2027-01-07");
  });

  it("leaves out weekends, public holidays, the midterm period and the winter holidays", () => {
    const excluded: IsoDate[] = [
      "2026-10-03",
      "2026-10-01",
      "2026-10-28",
      "2026-11-12",
      "2026-11-13",
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-12-21",
      "2027-01-04",
      "2027-01-06",
    ];
    for (const date of excluded) expect(days).not.toContain(date);
    expect(days).toContain("2026-11-11");
    expect(days).toContain("2026-11-19");
  });
});

describe("universityEvents", () => {
  const events = universityEvents();
  const sessions = events.filter((event) => !event.allDay);

  it("puts Group A's week on every teaching day", () => {
    // Mondays 12 × 4, Tuesdays 12 × 4, Wednesdays 11 × 3, Thursdays 12 × 3, Fridays 13 × 4.
    expect(sessions).toHaveLength(217);
    expect(
      sessions.filter((event) => event.type === "lab").every((e) => e.studentGroup === "A"),
    ).toBe(true);
    expect(
      sessions.some((event) => event.studentGroup !== null && event.studentGroup !== "A"),
    ).toBe(false);
  });

  it("schedules nothing in the midterm period", () => {
    const start = zonedInstant(FALL_2026.midterms.start, "00:00", FALL_2026.timeZone);
    const end = zonedInstant("2026-11-19", "00:00", FALL_2026.timeZone);
    expect(sessions.filter((event) => event.startsAt >= start && event.startsAt < end)).toEqual([]);
  });

  it("names lectures after their course and labs as the timetable does", () => {
    const monday = sessions.filter((event) => event.sourceKey.endsWith("@2026-10-05"));
    expect(monday.map((event) => event.title)).toEqual([
      "Pathophysiology I",
      "Pathophysiology Lab",
      "Pathophysiology Lab",
      "Pathophysiology Lab",
    ]);
    expect(monday[0]?.startsAt.toISOString()).toBe("2026-10-05T08:40:00.000Z");
  });

  it("includes the academic dates as all-day events", () => {
    const winter = events.find((event) => event.sourceKey === "2026-fall:date-winter-holidays");
    expect(winter).toMatchObject({ type: "holiday", allDay: true, courseId: null });
    expect(winter?.startsAt.toISOString()).toBe("2026-12-20T23:00:00.000Z");
    expect(winter?.endsAt.toISOString()).toBe("2027-01-06T23:00:00.000Z");
    expect(events.find((event) => event.sourceKey === "2026-fall:date-midterms")).toMatchObject({
      type: "midterm",
      title: "Midterm period",
    });
  });

  it("gives every event a unique, stable key", () => {
    const keys = events.map((event) => event.sourceKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(universityEvents().map((event) => event.sourceKey)).toEqual(keys);
  });
});
