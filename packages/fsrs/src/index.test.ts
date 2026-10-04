import { describe, expect, it } from "vitest";

import {
  type CardSchedule,
  intervalLabel,
  isDue,
  newSchedule,
  previewDue,
  retrievability,
  review,
} from "./index";

const start = new Date("2026-10-05T09:00:00Z");
const after = (schedule: CardSchedule, days: number) =>
  new Date(schedule.due.getTime() + days * 86_400_000);

describe("FSRS scheduling", () => {
  it("starts a card as new and due now", () => {
    const card = newSchedule(start);
    expect(card).toMatchObject({ state: "new", reps: 0, lapses: 0, lastReview: null });
    expect(isDue(card, start)).toBe(true);
    expect(retrievability(card, start)).toBeNull();
  });

  it("schedules better ratings further away", () => {
    const card = newSchedule(start);
    const due = previewDue(card, start);
    expect(due.again.getTime()).toBeLessThan(due.hard.getTime());
    expect(due.hard.getTime()).toBeLessThanOrEqual(due.good.getTime());
    expect(due.good.getTime()).toBeLessThan(due.easy.getTime());
    // What the preview says is what reviewing does.
    expect(review(card, "good", start).due).toEqual(due.good);
  });

  it("is deterministic: the same history gives the same schedule", () => {
    const run = () => {
      let card = newSchedule(start);
      card = review(card, "good", start);
      card = review(card, "good", card.due);
      return review(card, "hard", after(card, 1));
    };
    expect(run()).toEqual(run());
  });

  it("grows intervals with successful reviews and counts lapses", () => {
    let card = review(newSchedule(start), "easy", start);
    expect(card.state).toBe("review");
    const first = card.scheduledDays;
    card = review(card, "good", card.due);
    expect(card.scheduledDays).toBeGreaterThan(first);
    expect(card.reps).toBe(2);
    const lapsed = review(card, "again", card.due);
    expect(lapsed).toMatchObject({ state: "relearning", lapses: 1, reps: 3 });
    expect(lapsed.due.getTime() - card.due.getTime()).toBeLessThan(86_400_000);
  });

  it("estimates recall, lower the longer a card is overdue", () => {
    const card = review(newSchedule(start), "easy", start);
    const onTime = retrievability(card, card.due)!;
    const late = retrievability(card, after(card, 30))!;
    expect(onTime).toBeGreaterThan(0.8);
    expect(late).toBeLessThan(onTime);
  });

  it("labels intervals briefly", () => {
    expect(intervalLabel(start, new Date(start.getTime() + 60_000))).toBe("1 min");
    expect(intervalLabel(start, new Date(start.getTime() + 10 * 60_000))).toBe("10 min");
    expect(intervalLabel(start, new Date(start.getTime() + 5 * 3_600_000))).toBe("5 h");
    expect(intervalLabel(start, new Date(start.getTime() + 3 * 86_400_000))).toBe("3 d");
    expect(intervalLabel(start, new Date(start.getTime() + 90 * 86_400_000))).toBe("3 mo");
  });
});
