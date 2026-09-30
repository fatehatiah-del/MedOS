import { describe, expect, it } from "vitest";

import {
  COURSES,
  COURSE_IDS,
  DEFAULT_STUDY_AVAILABILITY,
  FALL_2026,
  academicPeriods,
  addDays,
  availableMinutesFor,
  daysBetween,
  findCourse,
  formatDate,
  formatDateRange,
  formatMinutes,
  isIsoDate,
  isWeekend,
  periodStatus,
  semesterWeekFor,
  semesterWeekRange,
} from "./index";

describe("courses", () => {
  it("defines exactly the six Semester 5 courses with unique ids", () => {
    expect(COURSES).toHaveLength(6);
    expect(new Set(COURSES.map((course) => course.id)).size).toBe(6);
    expect(COURSES.map((course) => course.id)).toEqual([...COURSE_IDS]);
  });

  it("keeps Public & Global Health and Communication Skills as separate courses", () => {
    expect(findCourse("public-health")?.name).toBe("Public & Global Health");
    expect(findCourse("communication-skills")?.name).toBe("Communication Skills");
  });

  it("returns undefined for unknown course ids", () => {
    expect(findCourse("anatomy")).toBeUndefined();
  });
});

describe("dates", () => {
  it("validates ISO calendar dates", () => {
    expect(isIsoDate("2026-09-30")).toBe(true);
    expect(isIsoDate("2026-02-31")).toBe(false);
    expect(isIsoDate("30/09/2026")).toBe(false);
  });

  it("counts whole days between dates across month and year boundaries", () => {
    expect(daysBetween("2026-09-30", "2026-11-12")).toBe(43);
    expect(daysBetween("2026-09-30", "2027-01-18")).toBe(110);
    expect(daysBetween("2026-10-01", "2026-09-30")).toBe(-1);
  });

  it("identifies weekends", () => {
    expect(isWeekend("2026-09-30")).toBe(false); // Wednesday
    expect(isWeekend("2026-10-03")).toBe(true); // Saturday
    expect(isWeekend("2026-10-04")).toBe(true); // Sunday
  });

  it("formats dates and ranges", () => {
    expect(formatDate("2026-09-30", { weekday: true })).toBe("Wednesday, 30 September");
    expect(formatDate("2026-09-30")).toBe("30 September");
    expect(formatDateRange(FALL_2026.midterms)).toBe("12–18 November 2026");
    expect(formatDateRange(FALL_2026.term)).toBe("28 September 2026 – 29 January 2027");
  });
});

describe("semester", () => {
  it("matches the Fall 2026 academic calendar", () => {
    expect(FALL_2026.term).toEqual({ start: "2026-09-28", end: "2027-01-29" });
    expect(FALL_2026.midterms).toEqual({ start: "2026-11-12", end: "2026-11-18" });
    expect(FALL_2026.finals).toEqual({ start: "2027-01-18", end: "2027-01-29" });
    expect(FALL_2026.group).toBe("A");
    expect(academicPeriods().map((period) => period.kind)).toEqual(["term", "midterms", "finals"]);
  });

  it("computes the teaching week", () => {
    expect(semesterWeekFor("2026-09-28")).toBe(1);
    expect(semesterWeekFor("2026-09-30")).toBe(1);
    expect(semesterWeekFor("2026-10-04")).toBe(1);
    expect(semesterWeekFor("2026-10-05")).toBe(2);
    expect(semesterWeekFor("2026-11-12")).toBe(7);
  });

  it("returns null outside the term", () => {
    expect(semesterWeekFor("2026-09-27")).toBeNull();
    expect(semesterWeekFor("2027-01-30")).toBeNull();
  });

  it("reports period status relative to a date", () => {
    expect(periodStatus("2026-09-30", FALL_2026.midterms)).toEqual({
      state: "upcoming",
      daysUntilStart: 43,
    });
    expect(periodStatus("2026-11-12", FALL_2026.midterms)).toEqual({
      state: "active",
      daysRemaining: 6,
    });
    expect(periodStatus("2026-11-19", FALL_2026.midterms)).toEqual({ state: "past" });
  });
});

describe("study time", () => {
  it("uses 150 minutes on weekdays and 240 on weekends by default", () => {
    expect(DEFAULT_STUDY_AVAILABILITY).toEqual({ weekdayMinutes: 150, weekendMinutes: 240 });
    expect(availableMinutesFor("2026-09-30")).toBe(150);
    expect(availableMinutesFor("2026-10-03")).toBe(240);
  });

  it("formats durations", () => {
    expect(formatMinutes(0)).toBe("0m");
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(80)).toBe("1h 20m");
    expect(formatMinutes(150)).toBe("2h 30m");
    expect(formatMinutes(240)).toBe("4h");
  });

  it("rejects invalid durations", () => {
    expect(() => formatMinutes(-5)).toThrow();
    expect(() => formatMinutes(Number.NaN)).toThrow();
  });
});

describe("teaching weeks as date ranges", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-09-28", 6)).toBe("2026-10-04");
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
  });

  it("gives each teaching week its seven days", () => {
    expect(semesterWeekRange(1)).toEqual({ start: "2026-09-28", end: "2026-10-04" });
    expect(semesterWeekRange(4)).toEqual({ start: "2026-10-19", end: "2026-10-25" });
  });

  it("agrees with semesterWeekFor", () => {
    for (const week of [1, 2, 7, 12]) {
      const range = semesterWeekRange(week);
      expect(semesterWeekFor(range.start)).toBe(week);
      expect(semesterWeekFor(range.end)).toBe(week);
    }
  });

  it("rejects week numbers that are not positive integers", () => {
    expect(() => semesterWeekRange(0)).toThrow();
    expect(() => semesterWeekRange(1.5)).toThrow();
  });
});
