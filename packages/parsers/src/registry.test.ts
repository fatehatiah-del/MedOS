import { describe, expect, it } from "vitest";

import { validateContent } from "./model";
import { PARSER_VERSIONS, identify, parseWith } from "./registry";
import { sampleQuestionBank, sampleQuiz, sampleStudyGuide } from "./testing/fixtures";

describe("identifying a parser", () => {
  it("chooses by the material's kind and the file's type", () => {
    expect(identify("study-guide", "Guide.docx")).toMatchObject({
      supported: true,
      parser: { id: "docx-study-guide", format: "study-guide" },
    });
    expect(identify("question-bank", "QB.DOCX")).toMatchObject({
      supported: true,
      parser: { id: "docx-question-bank", format: "question-bank" },
    });
    expect(identify("mcq", "quiz.htm")).toMatchObject({
      supported: true,
      parser: { format: "mcq-set" },
    });
    expect(identify("original-lecture", "Slides.pdf")).toMatchObject({
      supported: true,
      parser: { format: "pdf" },
    });
  });

  it("keeps MCQ and Question Bank separate: a DOCX question bank is never read as an MCQ", () => {
    expect(identify("question-bank", "x.docx")).not.toEqual(identify("mcq", "x.docx"));
    expect(identify("mcq", "x.docx")).toMatchObject({ supported: false });
  });

  it("explains why a file is not read", () => {
    expect(identify("study-guide", "Old.doc")).toMatchObject({
      supported: false,
      reason: expect.stringContaining(".docx"),
    });
    expect(identify("original-lecture", "Slides.pptx")).toMatchObject({
      supported: false,
      reason: expect.stringContaining("PowerPoint"),
    });
    expect(identify("flashcards", "deck.csv")).toMatchObject({ supported: false });
    expect(identify("image", "figure.png")).toMatchObject({
      supported: false,
      reason: expect.stringContaining("Kept as an original"),
    });
  });

  it("has a positive version for every parser", () => {
    expect(Object.keys(PARSER_VERSIONS).sort()).toEqual([
      "docx-question-bank",
      "docx-study-guide",
      "html-mcq",
      "pdf-registration",
    ]);
    expect(Object.values(PARSER_VERSIONS).every((version) => version > 0)).toBe(true);
  });
});

describe("parsed content", () => {
  it("validates for every format", async () => {
    for (const [kind, name, bytes] of [
      ["study-guide", "g.docx", sampleStudyGuide()],
      ["question-bank", "q.docx", sampleQuestionBank()],
      ["mcq", "m.html", sampleQuiz()],
    ] as const) {
      const identification = identify(kind, name);
      if (!identification.supported) throw new Error("expected a parser");
      const result = await parseWith(identification.parser, bytes);
      expect(validateContent(result.content).format).toBe(identification.parser.format);
    }
  });

  it("rejects content that breaks its schema", () => {
    expect(() => validateContent({ format: "unknown" })).toThrow();
    expect(() => validateContent(null)).toThrow();
    expect(() =>
      validateContent({
        format: "mcq-set",
        title: null,
        subtitle: null,
        questions: [
          {
            key: "q1",
            number: 1,
            fingerprint: "0123456789abcdef",
            stem: [{ type: "text", text: "Q" }],
            options: [
              { label: "A", text: [], explanation: null },
              { label: "B", text: [], explanation: null },
            ],
            // An answer that is not one of the options is never valid.
            answer: { status: "resolved", optionIndex: 5 },
            explanation: null,
            topic: null,
            questionType: null,
            sourceRef: null,
            image: null,
            revealImage: null,
          },
        ],
      }),
    ).toThrow(/one of the options/);
  });
});
