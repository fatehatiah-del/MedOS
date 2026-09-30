import { describe, expect, it } from "vitest";

import { TODAY_FIXTURE } from "./fixture";
import { describePeriodStatus, greetingFor, summariseToday, upcomingExamPeriods } from "./summary";

describe("greetingFor", () => {
  it("greets by time of day", () => {
    expect(greetingFor("08:15")).toBe("Good morning");
    expect(greetingFor("12:00")).toBe("Good afternoon");
    expect(greetingFor("15:00")).toBe("Good afternoon");
    expect(greetingFor("18:00")).toBe("Good evening");
    expect(greetingFor("02:30")).toBe("Good evening");
  });
});

describe("upcomingExamPeriods", () => {
  it("lists midterms and finals with a countdown early in the term", () => {
    const periods = upcomingExamPeriods("2026-09-30");
    expect(periods.map(({ period }) => period.kind)).toEqual(["midterms", "finals"]);
    expect(periods.map(({ status }) => describePeriodStatus(status))).toEqual([
      "In 43 days",
      "In 110 days",
    ]);
  });

  it("marks a period in progress and drops finished ones", () => {
    expect(describePeriodStatus(upcomingExamPeriods("2026-11-13")[0]!.status)).toBe("In progress");
    expect(upcomingExamPeriods("2026-12-01").map(({ period }) => period.kind)).toEqual(["finals"]);
  });
});

describe("summariseToday", () => {
  it("derives the week, availability and planned time for the fixture", () => {
    const summary = summariseToday(TODAY_FIXTURE);
    expect(summary.week).toBe(1);
    expect(summary.greeting).toBe("Good afternoon");
    expect(summary.availableMinutes).toBe(150);
    expect(summary.plannedMinutes).toBe(100);
  });

  it("never plans more than the available study time in the fixture", () => {
    const summary = summariseToday(TODAY_FIXTURE);
    expect(summary.plannedMinutes).toBeLessThanOrEqual(summary.availableMinutes);
  });
});
