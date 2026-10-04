import type { IsoDate } from "@medos/shared";
import { describe, expect, it } from "vitest";

import { streakOf, weekStart, weeklyTarget } from "./progress";

/* The streak and weekly target, on plain dates. */

describe("streakOf", () => {
  it("is zero without study", () => {
    expect(streakOf([], "2026-10-07")).toEqual({ current: 0, best: 0, studiedToday: false });
  });

  it("counts consecutive days ending today", () => {
    expect(streakOf(["2026-10-05", "2026-10-06", "2026-10-07"], "2026-10-07")).toEqual({
      current: 3,
      best: 3,
      studiedToday: true,
    });
  });

  it("keeps the streak alive until today is over", () => {
    expect(streakOf(["2026-10-05", "2026-10-06"], "2026-10-07")).toMatchObject({
      current: 2,
      studiedToday: false,
    });
  });

  it("is broken by a day without study, and remembers the best run", () => {
    const days: IsoDate[] = [
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-04",
      "2026-10-05",
    ];
    expect(streakOf(days, "2026-10-07")).toEqual({ current: 0, best: 4, studiedToday: false });
    expect(streakOf(days, "2026-10-06")).toEqual({ current: 2, best: 4, studiedToday: false });
  });

  it("ignores duplicates, order and days after today", () => {
    expect(
      streakOf(["2026-10-07", "2026-10-06", "2026-10-07", "2026-10-09"], "2026-10-07"),
    ).toEqual({
      current: 2,
      best: 2,
      studiedToday: true,
    });
  });

  it("runs across a month boundary", () => {
    expect(streakOf(["2026-09-30", "2026-10-01"], "2026-10-01").current).toBe(2);
  });
});

describe("weeklyTarget", () => {
  it("starts the week on Monday", () => {
    expect(weekStart("2026-10-07")).toBe("2026-10-05");
    expect(weekStart("2026-10-05")).toBe("2026-10-05");
    expect(weekStart("2026-10-11")).toBe("2026-10-05");
  });

  it("adds up the user's own study time for each day of the week", () => {
    const defaults = weeklyTarget(
      "2026-10-07",
      { weekdayMinutes: 150, weekendMinutes: 240 },
      new Map(),
    );
    expect(defaults).toMatchObject({
      start: "2026-10-05",
      end: "2026-10-11",
      targetMinutes: 5 * 150 + 2 * 240,
    });
    const custom = weeklyTarget(
      "2026-10-07",
      { weekdayMinutes: 60, weekendMinutes: 120 },
      new Map(),
    );
    expect(custom.targetMinutes).toBe(540);
  });

  it("counts study inside the week only, capping the share at 100%", () => {
    const minutes = new Map([
      ["2026-10-04", 300] as const,
      ["2026-10-05", 120] as const,
      ["2026-10-07", 90] as const,
    ]);
    const week = weeklyTarget("2026-10-07", { weekdayMinutes: 60, weekendMinutes: 60 }, minutes);
    expect(week).toMatchObject({ studiedMinutes: 210, daysStudied: 2, percent: 50 });
    const over = weeklyTarget("2026-10-07", { weekdayMinutes: 10, weekendMinutes: 0 }, minutes);
    expect(over.percent).toBe(100);
  });

  it("has no share when no study time is set", () => {
    expect(
      weeklyTarget("2026-10-07", { weekdayMinutes: 0, weekendMinutes: 0 }, new Map()).percent,
    ).toBeNull();
  });
});
