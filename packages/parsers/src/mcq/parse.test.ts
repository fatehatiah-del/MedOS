import { afterEach, describe, expect, it } from "vitest";

import { ParseError } from "../errors";
import { sha256 } from "../media";
import { mcqSetSchema, plainText } from "../model";
import { buildQuizHtml, pngBytes, sampleQuiz } from "../testing/fixtures";

import { emphasis, parseMcqHtml } from "./parse";

const scriptFlag = globalThis as { __medosQuizScriptRan?: boolean };

afterEach(() => {
  delete scriptFlag.__medosQuizScriptRan;
});

const quiz = (questions: unknown[], extra: Record<string, unknown> = {}) =>
  parseMcqHtml(buildQuizHtml({ questions, ...extra }));

const question = (overrides: Record<string, unknown> = {}) => ({
  stem: "Which is correct?",
  options: ["First", "Second", "Third"],
  answer: 0,
  ...overrides,
});

describe("HTML MCQ quiz", () => {
  const result = parseMcqHtml(sampleQuiz());
  const [first, second] = result.content.questions;

  it("produces content that satisfies the schema", () => {
    expect(() => mcqSetSchema.parse(result.content)).not.toThrow();
    expect(result.content.title).toBe("Sample Quiz");
  });

  it("keeps every question, choice, answer and explanation as written", () => {
    expect(result.content.questions).toHaveLength(2);
    expect(plainText(first!.stem)).toBe("Which receptor is fastest?");
    expect(first!.options.map((option) => [option.label, plainText(option.text)])).toEqual([
      ["A", "Nuclear"],
      ["B", "Ion channel"],
      ["C", "Kinase-linked"],
    ]);
    expect(first!.answer).toEqual({ status: "resolved", optionIndex: 1 });
    expect(plainText(first!.explanation ?? [])).toBe("Ion channels open in milliseconds.");
    expect(plainText(first!.options[0]!.explanation ?? [])).toBe(
      "Nuclear receptors act over hours.",
    );
    expect(first!.options[2]!.explanation).toBeNull();
    expect(first).toMatchObject({ topic: "Receptors", questionType: "mechanism", sourceRef: "S3" });
  });

  it("reads the quiz's own **bold** convention as emphasis", () => {
    expect(first!.stem).toEqual([
      { type: "text", text: "Which receptor is " },
      { type: "text", text: "fastest", marks: ["bold"] },
      { type: "text", text: "?" },
    ]);
  });

  it("accepts an answer given as a letter", () => {
    expect(second!.answer).toEqual({ status: "resolved", optionIndex: 0 });
    expect(second!.explanation).toBeNull();
  });

  it("gives each question a stable key and fingerprint", () => {
    expect(result.content.questions.map((q) => q.key)).toEqual(["q1", "q2"]);
    expect(parseMcqHtml(sampleQuiz()).content.questions[0]!.fingerprint).toBe(first!.fingerprint);
    expect(first!.fingerprint).not.toBe(second!.fingerprint);
  });
});

describe("HTML MCQ answers are never guessed", () => {
  it("marks a question without a stated answer as unresolved, and reports it", () => {
    const result = quiz([question({ answer: undefined })]);
    expect(result.content.questions[0]?.answer).toMatchObject({ status: "unresolved" });
    expect(result.stats.unresolved).toBe(1);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "answer-unresolved", location: "question 1" }),
    );
  });

  it("marks an out-of-range answer as unresolved", () => {
    expect(quiz([question({ answer: 7 })]).content.questions[0]?.answer.status).toBe("unresolved");
    expect(quiz([question({ answer: "F" })]).content.questions[0]?.answer.status).toBe(
      "unresolved",
    );
    expect(quiz([question({ answer: 1.5 })]).content.questions[0]?.answer.status).toBe(
      "unresolved",
    );
  });

  it("matches an answer given as text only when exactly one choice has that text", () => {
    expect(quiz([question({ answer: "Second" })]).content.questions[0]?.answer).toEqual({
      status: "resolved",
      optionIndex: 1,
    });
    const duplicate = quiz([question({ options: ["Same", "Same"], answer: "Same" })]);
    expect(duplicate.content.questions[0]?.answer.status).toBe("unresolved");
  });

  it("leaves out malformed questions and keeps the rest", () => {
    const result = quiz([
      question(),
      { stem: "No choices" },
      "not an object",
      question({ options: ["Only one"] }),
    ]);
    expect(result.content.questions).toHaveLength(1);
    expect(result.stats.skipped).toBe(3);
    expect(result.issues.filter((issue) => issue.code.startsWith("question-"))).toHaveLength(3);
  });

  it("reports explanations for choices that do not exist", () => {
    const result = quiz([question({ wrong: { "9": "No such choice." } })]);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "explanation-unmatched" }),
    );
  });
});

describe("HTML MCQ safety", () => {
  it("never runs the page's scripts or event handlers", () => {
    const result = parseMcqHtml(sampleQuiz());
    expect(scriptFlag.__medosQuizScriptRan).toBeUndefined();
    expect(JSON.stringify(result.content)).not.toMatch(/<script|onerror|onload|innerHTML/);
  });

  it("keeps markup inside question text as literal text, never as HTML", () => {
    const stem = '<img src=x onerror="alert(1)"> Which <b>one</b>?';
    const result = quiz([question({ stem })]);
    expect(plainText(result.content.questions[0]!.stem)).toBe(stem);
  });

  it("extracts embedded raster images and checks their bytes", () => {
    const png = `data:image/png;base64,${Buffer.from(pngBytes(5)).toString("base64")}`;
    const result = quiz([question({ img: png })]);
    expect(result.content.questions[0]?.image).toMatchObject({
      hash: sha256(pngBytes(5)),
      mimeType: "image/png",
    });
    expect(result.media).toHaveLength(1);
  });

  it("refuses SVG and images disguised by their declared type", () => {
    const svg = `data:image/svg+xml;base64,${Buffer.from("<svg><script>alert(1)</script></svg>").toString("base64")}`;
    const disguised = `data:image/png;base64,${Buffer.from("<svg></svg>").toString("base64")}`;
    const result = quiz([question({ img: svg, img_reveal: disguised })]);
    expect(result.content.questions[0]).toMatchObject({ image: null, revealImage: null });
    expect(result.media).toEqual([]);
    expect(result.issues.filter((issue) => issue.code === "image-not-imported")).toHaveLength(2);
  });

  it("never fetches images from the network", () => {
    const result = quiz([question({ img: "https://example.test/tracker.png" })]);
    expect(result.content.questions[0]?.image).toBeNull();
    expect(result.issues).toContainEqual(
      expect.objectContaining({ message: expect.stringContaining("not fetched") }),
    );
  });
});

describe("unreadable HTML quizzes", () => {
  const failure = (bytes: Uint8Array) => {
    try {
      parseMcqHtml(bytes);
    } catch (error) {
      return error;
    }
    throw new Error("expected a parse error");
  };

  it("explain when a page has no question data", () => {
    const error = failure(
      new TextEncoder().encode("<html><body><p>Question 1 …</p></body></html>"),
    );
    expect(error).toBeInstanceOf(ParseError);
    expect(error).toMatchObject({ code: "no-question-data" });
  });

  it("explain when the data is not valid JSON or has no questions", () => {
    const broken = new TextEncoder().encode(
      '<script type="application/json">{"questions": [</script>',
    );
    expect(failure(broken)).toMatchObject({ code: "no-question-data" });
    expect(failure(buildQuizHtml({ questions: [] }))).toMatchObject({ code: "no-question-data" });
  });

  it("explain when no question can be read", () => {
    expect(
      failure(buildQuizHtml({ questions: [{ stem: "", options: ["a", "b"] }] })),
    ).toMatchObject({
      code: "no-questions",
    });
  });
});

describe("emphasis", () => {
  it("keeps unmatched markers and line breaks", () => {
    expect(emphasis("a ** b")).toEqual([{ type: "text", text: "a ** b" }]);
    expect(emphasis("one\ntwo")).toEqual([
      { type: "text", text: "one" },
      { type: "break" },
      { type: "text", text: "two" },
    ]);
  });
});
