import { describe, expect, it } from "vitest";

import type { DisplayEvent } from "./load";
import {
  allDayOn,
  hourBounds,
  layoutDay,
  localParts,
  parseCalendarQuery,
  shiftAnchor,
  viewTitle,
  visibleRange,
} from "./model";
import { semesterWeeks } from "./semester-view";

describe("views", () => {
  it("reads the view and day from the address, defaulting to this week", () => {
    expect(parseCalendarQuery({}, "2026-10-07")).toEqual({ view: "week", anchor: "2026-10-07" });
    expect(parseCalendarQuery({ view: "month", date: "2026-11-02" }, "2026-10-07")).toEqual({
      view: "month",
      anchor: "2026-11-02",
    });
    expect(parseCalendarQuery({ view: "year", date: "2026-02-31" }, "2026-10-07")).toEqual({
      view: "week",
      anchor: "2026-10-07",
    });
  });

  it("shows a day, a Monday-to-Sunday week, whole weeks around a month, and the term", () => {
    expect(visibleRange("day", "2026-10-07")).toEqual({ start: "2026-10-07", end: "2026-10-07" });
    expect(visibleRange("week", "2026-10-07")).toEqual({ start: "2026-10-05", end: "2026-10-11" });
    expect(visibleRange("week", "2026-10-11")).toEqual({ start: "2026-10-05", end: "2026-10-11" });
    expect(visibleRange("month", "2026-11-15")).toEqual({ start: "2026-10-26", end: "2026-12-06" });
    expect(visibleRange("semester", "2026-11-15")).toEqual({
      start: "2026-09-28",
      end: "2027-01-31",
    });
  });

  it("moves by a day, a week or a month", () => {
    expect(shiftAnchor("day", "2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftAnchor("week", "2026-10-07", -1)).toBe("2026-09-30");
    expect(shiftAnchor("month", "2026-12-15", 1)).toBe("2027-01-01");
    expect(shiftAnchor("month", "2026-10-31", -1)).toBe("2026-09-01");
  });

  it("titles each view", () => {
    expect(viewTitle("day", "2026-10-07", visibleRange("day", "2026-10-07"))).toBe(
      "Wednesday, 7 October 2026",
    );
    expect(viewTitle("week", "2026-10-07", visibleRange("week", "2026-10-07"))).toBe(
      "5 Oct – 11 Oct 2026",
    );
    expect(viewTitle("month", "2026-10-07", visibleRange("month", "2026-10-07"))).toBe(
      "October 2026",
    );
  });
});

describe("placing events", () => {
  it("reads campus wall-clock time from an instant", () => {
    expect(localParts(new Date("2026-10-26T09:40:00Z"), "Europe/Berlin")).toEqual({
      date: "2026-10-26",
      minutes: 640,
    });
    expect(localParts(new Date("2026-10-04T22:30:00Z"), "Europe/Berlin")).toEqual({
      date: "2026-10-05",
      minutes: 30,
    });
  });

  it("puts overlapping blocks side by side and others full width", () => {
    const block = (id: string, start: number, end: number) => ({
      id,
      date: "2026-10-05" as const,
      startMinutes: start,
      endMinutes: end,
    });
    const placed = layoutDay([
      block("lecture", 640, 790),
      block("own", 700, 760),
      block("lab", 840, 885),
      block("lab2", 885, 930),
    ]);
    const at = (id: string) => placed.find((entry) => entry.block.id === id);
    expect(at("lecture")).toMatchObject({ column: 0, columns: 2 });
    expect(at("own")).toMatchObject({ column: 1, columns: 2 });
    expect(at("lab")).toMatchObject({ column: 0, columns: 1 });
    expect(at("lab2")).toMatchObject({ column: 0, columns: 1 });
  });

  it("shows 08:00 to 21:00, widened for anything outside", () => {
    expect(hourBounds([])).toEqual({ start: 8, end: 21 });
    expect(
      hourBounds([
        { id: "a", date: "2026-10-05", startMinutes: 7 * 60 + 30, endMinutes: 8 * 60 },
        { id: "b", date: "2026-10-05", startMinutes: 20 * 60, endMinutes: 21 * 60 + 15 },
      ]),
    ).toEqual({ start: 7, end: 22 });
  });
});

describe("semesterWeeks", () => {
  const allDay = (type: DisplayEvent["type"], title: string, date: string, endDate: string) =>
    ({ id: title, type, title, allDay: true, date, endDate, origin: "university" }) as DisplayEvent;

  it("numbers teaching weeks as the academic calendar does, skipping the holidays", () => {
    const days = Array.from({ length: 7 * 18 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 8, 28 + index));
      return date.toISOString().slice(0, 10) as DisplayEvent["date"];
    });
    const weeks = semesterWeeks(days, [
      allDay("holiday", "Winter holidays", "2026-12-21", "2027-01-06"),
      allDay("exam", "Final examination period", "2027-01-18", "2027-01-29"),
    ]);
    expect(weeks.map((week) => week.label)).toEqual([
      ...Array.from({ length: 12 }, (_, index) => `Week ${index + 1}`),
      "Winter holidays",
      "Winter holidays",
      "Week 13",
      "Week 14",
      "Final exams",
      "Final exams",
    ]);
  });
});

describe("allDayOn", () => {
  const survey = {
    allDay: true,
    type: "academic-deadline",
    date: "2026-12-14",
    endDate: "2027-01-15",
  } as const;
  const holidays = {
    allDay: true,
    type: "holiday",
    date: "2026-12-21",
    endDate: "2027-01-06",
  } as const;

  it("draws a multi-day academic date once, on its first day in view", () => {
    expect(allDayOn(survey, "2026-12-14", "2026-11-30")).toBe(true);
    expect(allDayOn(survey, "2026-12-15", "2026-11-30")).toBe(false);
    expect(allDayOn(survey, "2027-01-04", "2027-01-04")).toBe(true);
  });

  it("fills every day of a holiday", () => {
    expect(allDayOn(holidays, "2026-12-24", "2026-11-30")).toBe(true);
    expect(allDayOn(holidays, "2027-01-07", "2026-11-30")).toBe(false);
  });
});
