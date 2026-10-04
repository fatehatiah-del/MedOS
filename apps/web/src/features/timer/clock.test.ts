import { STUDY_TIMER, formatClock } from "@medos/shared";
import { describe, expect, it } from "vitest";

import { displaySeconds, heartbeatDue, pauseDecision, sessionLabel, spokenDuration } from "./clock";

const MINUTE = 60_000;

describe("pauseDecision", () => {
  it("does nothing while the user is active and the tab visible", () => {
    expect(pauseDecision({ now: 10 * MINUTE, lastInputAt: 9 * MINUTE, hiddenSince: null })).toBe(
      null,
    );
  });

  it("pauses after 5 minutes without input, backdated to the last input", () => {
    expect(pauseDecision({ now: 10 * MINUTE, lastInputAt: 5 * MINUTE, hiddenSince: null })).toEqual(
      { reason: "idle", idleForMs: 5 * MINUTE },
    );
    expect(
      pauseDecision({ now: 10 * MINUTE - 1, lastInputAt: 5 * MINUTE, hiddenSince: null }),
    ).toBe(null);
  });

  it("pauses after 2 minutes in the background, backdated to when the tab was hidden", () => {
    expect(
      pauseDecision({ now: 10 * MINUTE, lastInputAt: 8 * MINUTE, hiddenSince: 8 * MINUTE }),
    ).toEqual({ reason: "hidden", idleForMs: 2 * MINUTE });
    expect(
      pauseDecision({ now: 10 * MINUTE, lastInputAt: 9 * MINUTE, hiddenSince: 9 * MINUTE }),
    ).toBe(null);
  });

  it("backdates a background pause further when the user was already idle", () => {
    expect(
      pauseDecision({ now: 10 * MINUTE, lastInputAt: 6 * MINUTE, hiddenSince: 7 * MINUTE }),
    ).toEqual({ reason: "hidden", idleForMs: 4 * MINUTE });
  });
});

describe("heartbeatDue", () => {
  const beat = STUDY_TIMER.heartbeatSeconds * 1000;

  it("beats once per interval while the user is active and the tab visible", () => {
    expect(heartbeatDue({ now: beat, lastInputAt: beat - 1000, hiddenSince: null }, 0)).toBe(true);
    expect(heartbeatDue({ now: beat - 1, lastInputAt: beat - 1000, hiddenSince: null }, 0)).toBe(
      false,
    );
  });

  it("stays silent in the background or when the user is idle", () => {
    expect(heartbeatDue({ now: beat, lastInputAt: beat, hiddenSince: beat - 1 }, 0)).toBe(false);
    expect(heartbeatDue({ now: 10 * MINUTE, lastInputAt: 0, hiddenSince: null }, 0)).toBe(false);
  });
});

describe("displaySeconds", () => {
  it("adds the time since receipt only while running", () => {
    expect(displaySeconds({ state: "running", activeSeconds: 100 }, 1_000, 6_500)).toBe(105);
    expect(displaySeconds({ state: "paused", activeSeconds: 100 }, 1_000, 60_000)).toBe(100);
    expect(displaySeconds({ state: "interrupted", activeSeconds: 100 }, 1_000, 60_000)).toBe(100);
  });
});

describe("labels", () => {
  const course = {
    id: "c",
    slug: "pharma",
    name: "Pharmacology I",
    shortName: "Pharma",
    colorToken: null,
  };

  it("names the session by lecture, then course, then activity", () => {
    expect(
      sessionLabel({
        activity: "mcq",
        course,
        lecture: { id: "l", number: 2, title: "Receptors" },
      }),
    ).toBe("MCQ · Receptors");
    expect(sessionLabel({ activity: "revision", course, lecture: null })).toBe("Revision · Pharma");
    expect(sessionLabel({ activity: "other", course: null, lecture: null })).toBe("Other study");
  });

  it("formats clocks and spoken durations", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(245)).toBe("4:05");
    expect(formatClock(3729)).toBe("1:02:09");
    expect(spokenDuration(30)).toBe("under a minute");
    expect(spokenDuration(60)).toBe("1 minute");
    expect(spokenDuration(3900)).toBe("1 hour 5 minutes");
    expect(spokenDuration(7200)).toBe("2 hours");
  });
});
