import { describe, expect, it } from "vitest";

import { type QuestionStat, type WeaknessInput, detectWeaknesses } from "./weaknesses";

/*
 * Weaknesses come only from stated rules over real counts, and each one shows
 * exactly the evidence that made it weak. No scores.
 */

const question = (
  fingerprint: string,
  topic: string | null,
  answered: number,
  correct: number,
  lectureId = "l1",
): QuestionStat => ({
  courseId: "pharma",
  lectureId,
  resourceId: "quiz",
  fingerprint,
  topic,
  answered,
  correct,
});

const none: WeaknessInput = { questions: [], lectures: [], difficult: [] };

describe("detectWeaknesses", () => {
  it("finds nothing without activity", () => {
    expect(detectWeaknesses(none)).toEqual([]);
  });

  it("lists a topic below 70% with its accuracy and repeated errors as evidence", () => {
    const [weak] = detectWeaknesses({
      ...none,
      questions: [
        question("a", "GPCR signalling", 4, 1),
        question("b", " gpcr  Signalling", 4, 3),
        question("c", "GPCR signalling", 4, 3),
      ],
    });
    expect(weak).toMatchObject({
      kind: "topic",
      label: "GPCR signalling",
      lectureId: "l1",
      evidence: [
        { signal: "mcq-accuracy", text: "MCQ accuracy: 58% (12 answers)" },
        {
          signal: "repeated-errors",
          text: "Repeated errors: 1 question answered wrong more than once",
        },
      ],
    });
  });

  it("does not judge a topic on too few answers, or a strong one at all", () => {
    expect(
      detectWeaknesses({
        ...none,
        questions: [question("a", "Kinetics", 2, 1), question("b", "Dosing", 10, 9)],
      }),
    ).toEqual([]);
  });

  it("lists a lecture by its own signals, naming its weak topics as context", () => {
    const weaknesses = detectWeaknesses({
      ...none,
      questions: [question("a", "Receptors", 5, 1)],
      lectures: [
        {
          lectureId: "l1",
          courseId: "pharma",
          title: "Receptors",
          flashcardLapses: 4,
          weakRecall: 3,
          reviewLater: 1,
        },
        {
          lectureId: "l2",
          courseId: "pharma",
          title: "Kinetics",
          flashcardLapses: 2,
          weakRecall: 1,
          reviewLater: 1,
        },
      ],
    });
    const lecture = weaknesses.find((weakness) => weakness.kind === "lecture");
    expect(lecture).toMatchObject({
      label: "Receptors",
      evidence: [
        { signal: "flashcard-lapses", text: "Flashcard lapses: 4" },
        { signal: "weak-recall", text: "Question Bank: 3 questions last rated Again or Hard" },
      ],
      context: ["Weak topics in this lecture: Receptors"],
    });
    expect(weaknesses.some((weakness) => weakness.label === "Kinetics")).toBe(false);
  });

  it("joins a concept the user marked to its MCQ topic, or lists it on its own", () => {
    const weaknesses = detectWeaknesses({
      ...none,
      questions: [question("a", "Receptors", 10, 9)],
      difficult: [
        { id: "d1", courseId: "pharma", label: "receptors" },
        { id: "d2", courseId: "pharma", label: "Tachyphylaxis" },
      ],
    });
    expect(
      weaknesses.map((weakness) => [weakness.kind, weakness.label, weakness.difficultId]),
    ).toEqual([
      ["topic", "Receptors", "d1"],
      ["concept", "Tachyphylaxis", "d2"],
    ]);
    // A strong topic marked difficult still shows its accuracy, as context.
    expect(weaknesses[0]?.context).toEqual(["MCQ accuracy: 90% (10 answers)"]);
  });

  it("orders by the number of independent signals, deterministically", () => {
    const input: WeaknessInput = {
      ...none,
      questions: [
        question("a", "B topic", 4, 1),
        question("b", "A topic", 3, 0),
        question("c", "A topic", 3, 1),
      ],
    };
    const labels = detectWeaknesses(input).map((weakness) => weakness.label);
    expect(labels).toEqual(["A topic", "B topic"]);
    expect(
      detectWeaknesses({ ...input, questions: [...input.questions].reverse() }).map((w) => w.label),
    ).toEqual(labels);
  });

  it("reports untagged MCQ questions at lecture level", () => {
    const [weak] = detectWeaknesses({
      ...none,
      questions: [question("a", null, 6, 2)],
      lectures: [
        {
          lectureId: "l1",
          courseId: "pharma",
          title: "Intro",
          flashcardLapses: 0,
          weakRecall: 0,
          reviewLater: 0,
        },
      ],
    });
    expect(weak?.evidence[0]?.text).toBe(
      "MCQ accuracy on questions without a topic: 33% (6 answers)",
    );
  });
});
