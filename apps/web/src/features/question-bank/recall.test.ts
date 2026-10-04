import type { QuestionBankItem } from "@medos/parsers/model";
import { describe, expect, it } from "vitest";

import { itemStatuses, practiceOrder, revealedAnswer, toClientItem } from "./recall";

const paragraph = (text: string) => ({
  type: "paragraph" as const,
  inlines: [{ type: "text" as const, text }],
});

/* Invented items: structure only. */
const items: QuestionBankItem[] = [1, 2, 3, 4, 5].map((number) => ({
  key: `q${number}`,
  number,
  fingerprint: `${number}`.repeat(16),
  prompt: [paragraph(`Question ${number}`)],
  choices: [
    { label: "A", text: [{ type: "text", text: "First" }] },
    { label: "B", text: [{ type: "text", text: "Second" }] },
  ],
  answer: {
    status: "paired",
    blocks: [paragraph(`Model answer ${number}`)],
    correctLabel: "B",
    choiceNotes: [{ label: "A", text: [{ type: "text", text: "Why A is wrong" }] }],
  },
}));

const at = (minute: number) => new Date(Date.UTC(2026, 9, 4, 10, minute));

describe("what the browser receives", () => {
  it("never includes the model answer before revealing", () => {
    const json = JSON.stringify(toClientItem(items[0]!));
    expect(json).not.toContain("Model answer");
    expect(json).not.toContain("Why A is wrong");
    expect(json).not.toContain("correctLabel");
  });

  it("gets the source's answer only on revealing", () => {
    expect(revealedAnswer(items[0]!)).toMatchObject({ status: "paired", correctLabel: "B" });
  });
});

describe("practice order", () => {
  it("puts unpractised first, then Again, then Hard, then the rest longest ago first", () => {
    const attempts = [
      { itemFingerprint: "1".repeat(16), rating: "easy" as const, revealedAt: at(1) },
      { itemFingerprint: "2".repeat(16), rating: "good" as const, revealedAt: at(2) },
      { itemFingerprint: "2".repeat(16), rating: "again" as const, revealedAt: at(5) },
      { itemFingerprint: "3".repeat(16), rating: "hard" as const, revealedAt: at(3) },
      { itemFingerprint: "4".repeat(16), rating: "good" as const, revealedAt: at(0) },
    ];
    const statuses = itemStatuses(items, attempts);
    expect(statuses.get("q2")).toEqual({ attempts: 2, lastRating: "again", lastRevealedAt: at(5) });
    expect(practiceOrder(items, statuses)).toEqual(["q5", "q2", "q3", "q4", "q1"]);
  });

  it("treats an unrated reveal like Again, and keeps source order when nothing is practised", () => {
    const statuses = itemStatuses(items, [
      { itemFingerprint: "3".repeat(16), rating: null, revealedAt: at(1) },
    ]);
    expect(practiceOrder(items, statuses)).toEqual(["q1", "q2", "q4", "q5", "q3"]);
    expect(practiceOrder(items, itemStatuses(items, []))).toEqual(["q1", "q2", "q3", "q4", "q5"]);
  });
});
