import { describe, expect, it } from "vitest";

import {
  courseProgressLabel,
  formatWeekDates,
  lectureHref,
  nextIncompleteLecture,
  outlineProgress,
  summariseProgress,
  weekProgress,
  weekProgressLabel,
} from "./progress";

const done = { completedAt: new Date("2026-10-01T10:00:00Z") };
const open = { completedAt: null };

describe("summariseProgress", () => {
  it("is completed lectures over total lectures", () => {
    expect(summariseProgress(1, 4)).toEqual({
      total: 4,
      completed: 1,
      percent: 25,
      state: "in-progress",
    });
    expect(summariseProgress(0, 4).state).toBe("not-started");
    expect(summariseProgress(4, 4)).toMatchObject({ percent: 100, state: "complete" });
  });

  it("has no percentage when there are no lectures, rather than 0%", () => {
    expect(summariseProgress(0, 0)).toEqual({
      total: 0,
      completed: 0,
      percent: null,
      state: "empty",
    });
  });

  it("never reports more than everything or less than nothing", () => {
    expect(summariseProgress(9, 4)).toMatchObject({ completed: 4, percent: 100 });
    expect(summariseProgress(-2, 4)).toMatchObject({ completed: 0, percent: 0 });
  });
});

describe("labels", () => {
  it("describe a course neutrally when nothing exists or nothing is done", () => {
    expect(courseProgressLabel(summariseProgress(0, 0))).toBe("No lectures yet");
    expect(courseProgressLabel(summariseProgress(0, 4))).toBe("4 lectures");
    expect(courseProgressLabel(summariseProgress(0, 1))).toBe("1 lecture");
  });

  it("describe partial and full completion", () => {
    expect(courseProgressLabel(summariseProgress(1, 4))).toBe("1 of 4 lectures complete");
    expect(courseProgressLabel(summariseProgress(4, 4))).toBe("All 4 lectures complete");
    expect(courseProgressLabel(summariseProgress(1, 1))).toBe("1 lecture, complete");
  });

  it("describe a week", () => {
    expect(weekProgressLabel(weekProgress({ lectures: [] }))).toBe("No lectures yet");
    expect(weekProgressLabel(weekProgress({ lectures: [open] }))).toBe("1 lecture");
    expect(weekProgressLabel(weekProgress({ lectures: [done, open] }))).toBe("1 of 2 complete");
    expect(weekProgressLabel(weekProgress({ lectures: [done, done] }))).toBe("Complete");
  });
});

describe("outlineProgress", () => {
  const weeks = [
    { lectures: [done] },
    { lectures: [open] },
    { lectures: [] },
    { lectures: [open, open] },
  ];

  it("counts lectures across weeks", () => {
    expect(outlineProgress(weeks)).toMatchObject({ total: 4, completed: 1, percent: 25 });
  });

  it("is not distorted by empty weeks", () => {
    const withMoreEmptyWeeks = [...weeks, { lectures: [] }, { lectures: [] }];
    expect(outlineProgress(withMoreEmptyWeeks)).toEqual(outlineProgress(weeks));
  });

  it("is empty, not zero percent, for a course with only empty weeks", () => {
    expect(outlineProgress([{ lectures: [] }]).percent).toBeNull();
    expect(outlineProgress([]).state).toBe("empty");
  });
});

describe("nextIncompleteLecture", () => {
  it("is the first lecture not yet complete, in week then lecture order", () => {
    const second = { id: "4.2", completedAt: null };
    const weeks = [
      { number: 1, lectures: [{ id: "1.1", ...done }] },
      { number: 3, lectures: [] },
      { number: 4, lectures: [{ id: "4.1", ...done }, second, { id: "4.3", completedAt: null }] },
    ];

    const next = nextIncompleteLecture(weeks);

    expect(next?.week.number).toBe(4);
    expect(next?.lecture).toBe(second);
  });

  it("is nothing when every lecture is complete or none exist", () => {
    expect(nextIncompleteLecture([{ lectures: [done] }])).toBeNull();
    expect(nextIncompleteLecture([{ lectures: [] }])).toBeNull();
  });
});

describe("addresses and dates", () => {
  it("addresses a lecture by course slug and lecture id, not by title or week", () => {
    expect(lectureHref("pharmacology", "0b7c6a0e-1111-4222-8333-444455556666")).toBe(
      "/courses/pharmacology/lectures/0b7c6a0e-1111-4222-8333-444455556666",
    );
  });

  it("formats a week's dates compactly", () => {
    expect(formatWeekDates("2026-09-28", "2026-10-04")).toBe("28 Sept – 4 Oct");
    expect(formatWeekDates(null, null)).toBeNull();
  });
});
