import type { McqQuestion, McqSet } from "@medos/parsers/model";
import { describe, expect, it } from "vitest";

import { timeLimitFor } from "./logic";
import { isUsmleQuestion, quizTopics, selectQuestions } from "./selection";
import { buildResults, feedbackFor, toClientQuestion } from "./views";

const text = (value: string) => [{ type: "text" as const, text: value }];
const IMAGE = { hash: "a".repeat(64), mimeType: "image/png" as const, sizeBytes: 1 };

/* Invented questions: structure only. */
function question(number: number, type: string | null, topic: string | null): McqQuestion {
  return {
    key: `q${number}`,
    number,
    fingerprint: `${number}`.padStart(16, "0"),
    stem: text(`Stem ${number}`),
    options: ["A", "B", "C", "D"].map((label, index) => ({
      label,
      text: text(`Option ${label}`),
      explanation: index === 0 ? text(`Why ${label} is wrong`) : null,
    })),
    answer:
      number === 6
        ? { status: "unresolved", reason: "No answer stated." }
        : { status: "resolved", optionIndex: 2 },
    explanation: text(`Explanation ${number}`),
    topic,
    questionType: type,
    sourceRef: `S${number}`,
    image: null,
    revealImage: IMAGE,
  };
}

const set: McqSet = {
  format: "mcq-set",
  title: "Synthetic",
  subtitle: null,
  questions: [
    question(1, "recall", "Alpha"),
    question(2, "mechanism", "Alpha"),
    question(3, "Vignette", "Beta"),
    question(4, "graph", "Beta"),
    question(5, "application", null),
    question(6, "consequence", "Beta"),
  ],
};

describe("what the browser receives", () => {
  it("never includes the answer, explanations or the after-answer image before answering", () => {
    const client = toClientQuestion(set.questions[1]!);
    const json = JSON.stringify(client);
    expect(json).not.toContain("answer");
    expect(json).not.toContain("Explanation");
    expect(json).not.toContain("Why A is wrong");
    expect(json).not.toContain("a".repeat(64));
    expect(client.options.map((option) => option.label)).toEqual(["A", "B", "C", "D"]);
  });

  it("receives feedback only for an answer", () => {
    expect(feedbackFor(set.questions[0]!, 2)).toMatchObject({
      correct: true,
      correctIndex: 2,
      sourceRef: "S1",
      revealImage: IMAGE,
    });
    expect(feedbackFor(set.questions[0]!, 0).correct).toBe(false);
    expect(feedbackFor(set.questions[5]!, 0)).toMatchObject({ correct: null, correctIndex: null });
  });
});

describe("choosing questions", () => {
  it("uses only USMLE-type questions in USMLE mode, vignettes first", () => {
    expect(set.questions.filter(isUsmleQuestion).map((q) => q.key)).toEqual([
      "q2",
      "q3",
      "q5",
      "q6",
    ]);
    expect(
      selectQuestions(set, { mode: "usmle", topic: null, count: null, shuffle: false }),
    ).toEqual(["q3", "q2", "q5", "q6"]);
  });

  it("filters by topic, limits the count, and keeps source order in Learn mode", () => {
    expect(
      selectQuestions(set, { mode: "learn", topic: "Beta", count: null, shuffle: true }),
    ).toEqual(["q3", "q4", "q6"]);
    expect(selectQuestions(set, { mode: "exam", topic: null, count: 2, shuffle: false })).toEqual([
      "q1",
      "q2",
    ]);
    expect(quizTopics(set)).toEqual([
      { topic: "Alpha", count: 2 },
      { topic: "Beta", count: 3 },
    ]);
  });

  it("shuffles exam questions when asked, keeping every question once", () => {
    let seed = 7;
    const random = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const keys = selectQuestions(set, {
      mode: "exam",
      topic: null,
      count: null,
      shuffle: true,
      random,
    });
    expect([...keys].sort()).toEqual(set.questions.map((q) => q.key).sort());
    expect(keys).not.toEqual(set.questions.map((q) => q.key));
  });

  it("time an exam at 90 seconds a question unless chosen otherwise", () => {
    expect(timeLimitFor("exam", 40, "default", null)).toBe(3600);
    expect(timeLimitFor("usmle", 10, "custom", 25)).toBe(1500);
    expect(timeLimitFor("exam", 40, "untimed", null)).toBeNull();
    expect(timeLimitFor("learn", 40, "default", null)).toBeNull();
  });
});

describe("results", () => {
  it("score, break down by topic and type, and list incorrect, flagged and unanswered", () => {
    const session = {
      questions: set.questions.map((q) => ({ key: q.key, fingerprint: q.fingerprint })),
      elapsedSeconds: 125,
    };
    const attempts = [
      { questionKey: "q1", selectedOption: 2, flagged: false, timeSpentMs: 1000 },
      { questionKey: "q2", selectedOption: 0, flagged: true, timeSpentMs: 2000 },
      { questionKey: "q3", selectedOption: 2, flagged: false, timeSpentMs: 3000 },
      { questionKey: "q4", selectedOption: null, flagged: false, timeSpentMs: 0 },
      { questionKey: "q6", selectedOption: 1, flagged: false, timeSpentMs: 0 },
    ];
    const results = buildResults(set, session, attempts);
    expect(results).toMatchObject({
      total: 6,
      answered: 4,
      correct: 2,
      scored: 5,
      percent: 40,
      incorrect: ["q2", "q4", "q5"],
      flagged: ["q2"],
      unanswered: ["q4", "q5"],
      elapsedSeconds: 125,
    });
    expect(results.byTopic).toEqual([
      { label: "Alpha", correct: 1, scored: 2 },
      { label: "Beta", correct: 1, scored: 2 },
      { label: "No topic given", correct: 0, scored: 1 },
    ]);
    expect(results.byType.find((row) => row.label === "Vignette")).toEqual({
      label: "Vignette",
      correct: 1,
      scored: 1,
    });
  });
});
