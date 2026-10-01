import { describe, expect, it } from "vitest";

import { ParseError } from "../errors";
import { blocksText, plainText, questionBankSchema } from "../model";
import {
  buildDocx,
  heading,
  imageParagraph,
  paragraph,
  pngBytes,
  run,
  sampleQuestionBank,
} from "../testing/fixtures";

import { parseQuestionBankDocx } from "./parse";

describe("question bank: numbered questions with an answers section", () => {
  const result = parseQuestionBankDocx(sampleQuestionBank());
  const [first, second] = result.content.items;

  it("produces content that satisfies the schema", () => {
    expect(() => questionBankSchema.parse(result.content)).not.toThrow();
    expect(result.content.title).toBe("Practice Questions");
  });

  it("keeps each question's text and lettered choices", () => {
    expect(first).toMatchObject({ key: "q1", number: 1 });
    expect(blocksText(first!.prompt)).toBe("Which receptor is fastest?");
    expect(first!.choices.map((choice) => [choice.label, plainText(choice.text)])).toEqual([
      ["A", "Nuclear receptor"],
      ["B", "Ion channel"],
    ]);
    expect(second?.choices).toEqual([]);
  });

  it("pairs each question with the answer of the same number, verbatim", () => {
    expect(first?.answer).toMatchObject({ status: "paired", correctLabel: "B" });
    if (first?.answer.status !== "paired") return;
    expect(blocksText(first.answer.blocks)).toBe("B — Ion channel. They open within milliseconds.");
    expect(first.answer.choiceNotes.map((note) => [note.label, plainText(note.text)])).toEqual([
      ["A", "Nuclear receptors act over hours."],
    ]);

    expect(second?.answer).toMatchObject({ status: "paired", correctLabel: null });
    if (second?.answer.status !== "paired") return;
    expect(blocksText(second.answer.blocks)).toBe("Affinity is how tightly a drug binds.");
  });

  it("summarises what it found", () => {
    expect(result.stats).toEqual({ items: 2, paired: 2, unpaired: 0, withChoices: 1 });
    expect(result.issues).toEqual([]);
    expect(result.searchText).toContain("Affinity is how tightly a drug binds.");
  });
});

describe("question bank: ambiguous structure is flagged, never guessed", () => {
  it("keeps a question without an answer, marked missing", () => {
    const { content, issues } = parseQuestionBankDocx(
      buildDocx(
        [
          paragraph("1. First question?"),
          paragraph("2. Second question?"),
          heading("Answers"),
          paragraph("1. First answer."),
        ].join(""),
      ),
    );
    expect(content.items.map((item) => item.answer.status)).toEqual(["paired", "missing"]);
    expect(issues.map((issue) => issue.code)).toContain("unpaired-questions");
  });

  it("does not pair a number that is used twice", () => {
    const { content } = parseQuestionBankDocx(
      buildDocx(
        [
          paragraph("1. A question?"),
          paragraph("1. Another question with the same number?"),
          paragraph("2. A third question?"),
          heading("Answers"),
          paragraph("1. An answer."),
          paragraph("2. The third answer."),
          paragraph("2. A second answer numbered 2."),
        ].join(""),
      ),
    );
    expect(content.items.map((item) => item.answer.status)).toEqual([
      "ambiguous",
      "ambiguous",
      "ambiguous",
    ]);
  });

  it("reports an answer that has no question and leaves it out", () => {
    const { content, issues } = parseQuestionBankDocx(
      buildDocx(
        [
          paragraph("1. Question?"),
          heading("Answer key"),
          paragraph("1. Yes."),
          paragraph("7. Orphan."),
        ].join(""),
      ),
    );
    expect(content.items).toHaveLength(1);
    expect(issues).toContainEqual(
      expect.objectContaining({ code: "answer-without-question", location: "answer 7" }),
    );
  });

  it("does not take a correct letter that is not one of the choices", () => {
    const { content } = parseQuestionBankDocx(
      buildDocx(
        [
          paragraph("1. Question?"),
          paragraph("A. One"),
          paragraph("B. Two"),
          heading("Answers"),
          paragraph("1. E — not a listed choice."),
        ].join(""),
      ),
    );
    expect(content.items[0]?.answer).toMatchObject({ status: "paired", correctLabel: null });
  });
});

describe("question bank: Q:/A: pairs", () => {
  it("pairs each Q with the A that follows it, including multi-paragraph answers", () => {
    const { content } = parseQuestionBankDocx(
      buildDocx(
        [
          paragraph("Q: What is efficacy?"),
          paragraph("A: The maximal effect a drug can produce."),
          paragraph("It is shown by the plateau."),
          paragraph("Question: What is potency?"),
          paragraph("Answer: The dose needed for an effect."),
        ].join(""),
      ),
    );
    expect(content.items.map((item) => blocksText(item.prompt))).toEqual([
      "What is efficacy?",
      "What is potency?",
    ]);
    expect(content.items[0]?.answer).toMatchObject({ status: "paired" });
    if (content.items[0]?.answer.status !== "paired") return;
    expect(blocksText(content.items[0].answer.blocks)).toBe(
      "The maximal effect a drug can produce.\nIt is shown by the plateau.",
    );
  });

  it("flags a question followed by two answers, and an answer before any question", () => {
    const { content, issues } = parseQuestionBankDocx(
      buildDocx(
        [
          paragraph("A: Stray answer."),
          paragraph("Q: One?"),
          paragraph("A: First."),
          paragraph("A: Second."),
          paragraph("Q: Two?"),
        ].join(""),
      ),
    );
    expect(content.items.map((item) => item.answer.status)).toEqual(["ambiguous", "missing"]);
    expect(issues.map((issue) => issue.code)).toContain("answer-without-question");
  });
});

describe("question bank: other layouts", () => {
  it("reads questions and choices numbered by Word itself", () => {
    const { content } = parseQuestionBankDocx(
      buildDocx(
        [
          paragraph("Which is a GPCR?", { list: { numId: 3 } }),
          paragraph("β₂ receptor", { list: { numId: 3, level: 1 } }),
          paragraph("nAChR", { list: { numId: 3, level: 1 } }),
          heading("Answers"),
          paragraph("A — β₂ receptor.", { list: { numId: 3 } }),
        ].join(""),
      ),
    );
    expect(content.items[0]).toMatchObject({ number: 1 });
    expect(content.items[0]?.choices.map((choice) => choice.label)).toEqual(["A", "B"]);
    expect(content.items[0]?.answer).toMatchObject({ status: "paired", correctLabel: "A" });
  });

  it("keeps images with the question they belong to", () => {
    const { content, media } = parseQuestionBankDocx(
      buildDocx(
        [
          paragraph([run("1. Read the graph.", { bold: true })]),
          imageParagraph("rIdG"),
          paragraph("A. Left shift"),
          heading("Answers"),
          paragraph("1. A — Left shift."),
        ].join(""),
        { images: { rIdG: { name: "graph.png", bytes: pngBytes(3) } } },
      ),
    );
    expect(content.items[0]?.prompt.map((block) => block.type)).toEqual(["paragraph", "image"]);
    expect(media).toHaveLength(1);
  });

  it("fails with a useful message when there are no questions", () => {
    let error: unknown;
    try {
      parseQuestionBankDocx(buildDocx(paragraph("Just some notes, no questions.")));
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ParseError);
    expect(error).toMatchObject({
      code: "no-questions",
      message: expect.stringContaining("Answers"),
    });
  });
});
