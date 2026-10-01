import { Parser } from "htmlparser2";
import { z } from "zod";

import { LIMITS, ParseError } from "../errors";
import { MediaCollector, fingerprint, toMedia } from "../media";
import {
  type Inline,
  type McqAnswer,
  type McqQuestion,
  type McqSet,
  type MediaRef,
  type ParseIssue,
  plainText,
} from "../model";
import { capSearchText, type ParseResult } from "../result";

/*
 * Parses an HTML quiz into MCQ questions.
 *
 * The HTML is untrusted. It is never rendered, and none of its scripts run:
 * the page is only tokenised, and the question set is read from its JSON data
 * block (<script type="application/json">) as plain data. Inline handlers,
 * styles and markup are ignored. Images are taken only from embedded data:
 * URLs of raster types; nothing is fetched from the network.
 *
 * Question text, choices, answers and explanations are kept as written. The
 * only interpretation is the quiz's own emphasis convention (**bold**).
 */

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** One question as quiz files store it. Unknown fields are ignored. */
const sourceQuestionSchema = z.object({
  stem: z.string().optional(),
  question: z.string().optional(),
  options: z.array(z.unknown()).optional(),
  choices: z.array(z.unknown()).optional(),
  answer: z.unknown().optional(),
  correct: z.unknown().optional(),
  explain: z.unknown().optional(),
  explanation: z.unknown().optional(),
  wrong: z.unknown().optional(),
  topic: z.unknown().optional(),
  type: z.unknown().optional(),
  source: z.unknown().optional(),
  img: z.unknown().optional(),
  img_reveal: z.unknown().optional(),
});

export function parseMcqHtml(bytes: Uint8Array): ParseResult<McqSet> {
  const html = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const blocks = jsonBlocks(html);
  if (blocks.length === 0) {
    throw new ParseError(
      "no-question-data",
      "This quiz page does not contain a question set MedOS can read. MedOS reads quizzes that " +
        "store their questions as JSON data in the page.",
    );
  }

  let data: { container: Record<string, unknown>; questions: unknown[] } | null = null;
  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block);
    } catch {
      continue;
    }
    const found = findQuestions(parsed);
    if (found) {
      data = found;
      break;
    }
  }
  if (!data) {
    throw new ParseError(
      "no-question-data",
      "This quiz page's data could not be read as a list of questions.",
    );
  }

  const issues: ParseIssue[] = [];
  const media = new MediaCollector();
  const questions: McqQuestion[] = [];

  data.questions.forEach((raw, index) => {
    const number = index + 1;
    const location = `question ${number}`;
    const parsed = sourceQuestionSchema.safeParse(raw);
    if (!parsed.success) {
      issues.push({
        code: "question-unreadable",
        message: "This question could not be read and was left out.",
        location,
      });
      return;
    }
    const source = parsed.data;
    const stemText = cleanText(source.stem ?? source.question ?? "");
    const optionTexts = (source.options ?? source.choices ?? []).map((option) =>
      typeof option === "string" ? cleanText(option) : null,
    );
    if (
      stemText === "" ||
      optionTexts.length < 2 ||
      optionTexts.some((option) => option === null || option === "")
    ) {
      issues.push({
        code: "question-incomplete",
        message:
          "This question has no text or fewer than two readable choices, so it was left out.",
        location,
      });
      return;
    }
    if (optionTexts.length > LETTERS.length) {
      issues.push({
        code: "question-incomplete",
        message: "This question has too many choices and was left out.",
        location,
      });
      return;
    }
    const options = optionTexts as string[];

    const answer = resolveAnswer(source.answer ?? source.correct, options);
    if (answer.status === "unresolved") {
      issues.push({
        code: "answer-unresolved",
        message: `The correct answer could not be determined: ${answer.reason}`,
        location,
      });
    }

    const wrong = optionExplanations(source.wrong, options.length, issues, location);
    const image = imageOf(source.img, media, issues, location);
    const revealImage = imageOf(source.img_reveal, media, issues, location);
    const explanation = optionalText(source.explain ?? source.explanation);

    questions.push({
      key: `q${number}`,
      number,
      fingerprint: fingerprint([stemText, ...options].join("\n")),
      stem: emphasis(stemText),
      options: options.map((text, optionIndex) => ({
        label: LETTERS[optionIndex]!,
        text: emphasis(text),
        explanation: wrong.get(optionIndex) ?? null,
      })),
      answer,
      explanation: explanation ? emphasis(explanation) : null,
      topic: optionalText(source.topic),
      questionType: optionalText(source.type),
      sourceRef: optionalText(source.source),
      image,
      revealImage,
    });
  });

  if (questions.length === 0) {
    throw new ParseError("no-questions", "None of this quiz's questions could be read.");
  }

  const unresolved = questions.filter((question) => question.answer.status === "unresolved").length;
  const searchText = capSearchText(
    questions
      .map((question) =>
        [
          plainText(question.stem),
          ...question.options.map((option) => `${option.label}. ${plainText(option.text)}`),
          question.explanation ? plainText(question.explanation) : "",
          question.topic ?? "",
        ].join("\n"),
      )
      .join("\n\n"),
  );

  return {
    content: {
      format: "mcq-set",
      title: optionalText(data.container.title),
      subtitle: optionalText(data.container.subtitle),
      questions,
    },
    media: media.list(),
    issues,
    stats: {
      questions: questions.length,
      unresolved,
      skipped: data.questions.length - questions.length,
      withImages: questions.filter((question) => question.image).length,
    },
    searchText,
  };
}

/** The text of every <script type="application/json"> element. No other script is read. */
function jsonBlocks(html: string): string[] {
  const blocks: string[] = [];
  let current: string[] | null = null;
  let size = 0;
  const parser = new Parser(
    {
      onopentag(name, attributes) {
        const type = (attributes.type ?? "").trim().toLowerCase();
        if (name === "script" && (type === "application/json" || type === "application/ld+json")) {
          current = [];
          size = 0;
        }
      },
      ontext(text) {
        if (!current) return;
        size += text.length;
        if (size > LIMITS.maxJsonBytes) {
          throw new ParseError(
            "too-large",
            "This quiz page's question data is too large to import.",
          );
        }
        current.push(text);
      },
      onclosetag(name) {
        if (name === "script" && current) {
          blocks.push(current.join(""));
          current = null;
        }
      },
    },
    { decodeEntities: false, lowerCaseTags: true, lowerCaseAttributeNames: true },
  );
  parser.write(html);
  parser.end();
  return blocks;
}

/** The first array of question-like objects: the data itself, or a property of it. */
function findQuestions(
  value: unknown,
): { container: Record<string, unknown>; questions: unknown[] } | null {
  const looksLikeQuestions = (candidate: unknown): candidate is unknown[] =>
    Array.isArray(candidate) &&
    candidate.length > 0 &&
    candidate.some(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        ("stem" in entry || "question" in entry) &&
        ("options" in entry || "choices" in entry),
    );
  if (looksLikeQuestions(value)) return { container: {}, questions: value };
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    for (const key of ["questions", "items", "quiz", "data"]) {
      if (looksLikeQuestions(record[key])) return { container: record, questions: record[key] };
    }
  }
  return null;
}

/**
 * The correct option. Accepted only when the source states it unambiguously:
 * an index within range, a letter, or the exact text of one option.
 */
function resolveAnswer(value: unknown, options: readonly string[]): McqAnswer {
  if (value === undefined || value === null || value === "") {
    return { status: "unresolved", reason: "the quiz does not state an answer." };
  }
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 && value < options.length
      ? { status: "resolved", optionIndex: value }
      : { status: "unresolved", reason: `the stated answer (${value}) is not one of the choices.` };
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^[A-Za-z]$/.test(trimmed)) {
      const index = LETTERS.indexOf(trimmed.toUpperCase());
      return index < options.length
        ? { status: "resolved", optionIndex: index }
        : {
            status: "unresolved",
            reason: `the stated answer (${trimmed}) is not one of the choices.`,
          };
    }
    const matches = options.flatMap((option, index) =>
      option === cleanText(trimmed) ? [index] : [],
    );
    if (matches.length === 1) return { status: "resolved", optionIndex: matches[0]! };
    return { status: "unresolved", reason: "the stated answer does not match exactly one choice." };
  }
  return { status: "unresolved", reason: "the stated answer is in a form MedOS does not read." };
}

/** Explanations of wrong options, keyed by option index (or letter) in the source. */
function optionExplanations(
  value: unknown,
  optionCount: number,
  issues: ParseIssue[],
  location: string,
): Map<number, Inline[]> {
  const result = new Map<number, Inline[]>();
  if (value === undefined || value === null) return result;
  if (typeof value !== "object" || Array.isArray(value)) {
    issues.push({
      code: "explanations-unreadable",
      message: "The explanations of wrong choices could not be read.",
      location,
    });
    return result;
  }
  for (const [key, text] of Object.entries(value as Record<string, unknown>)) {
    const index = /^\d+$/.test(key)
      ? Number.parseInt(key, 10)
      : /^[A-Za-z]$/.test(key)
        ? LETTERS.indexOf(key.toUpperCase())
        : -1;
    const cleaned = typeof text === "string" ? cleanText(text) : "";
    if (index < 0 || index >= optionCount || cleaned === "") {
      issues.push({
        code: "explanation-unmatched",
        message: `An explanation for choice "${key}" does not match any choice and was left out.`,
        location,
      });
      continue;
    }
    result.set(index, emphasis(cleaned));
  }
  return result;
}

const DATA_URL = /^data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/=\s]+)$/i;

function imageOf(
  value: unknown,
  media: MediaCollector,
  issues: ParseIssue[],
  location: string,
): MediaRef | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const match = DATA_URL.exec(value.trim());
  if (!match) {
    issues.push({
      code: "image-not-imported",
      message: "An image refers to a location outside the quiz file and was not fetched.",
      location,
    });
    return null;
  }
  const encoded = match[1]!.replace(/\s+/g, "");
  if ((encoded.length * 3) / 4 > LIMITS.maxImageBytes) {
    issues.push({
      code: "image-not-imported",
      message: "An image is too large to import.",
      location,
    });
    return null;
  }
  const outcome = toMedia(new Uint8Array(Buffer.from(encoded, "base64")));
  if (!outcome.ok) {
    issues.push({ code: "image-not-imported", message: outcome.reason, location });
    return null;
  }
  return media.add(outcome.media);
}

function optionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = cleanText(value);
  return cleaned === "" ? null : cleaned;
}

/** Removes control characters (except line breaks and tabs) and normalises line endings. */
export function cleanText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
}

/** The quiz convention **text** as bold; everything else is literal text. */
export function emphasis(text: string): Inline[] {
  const inlines: Inline[] = [];
  const pattern = /\*\*(.+?)\*\*/gs;
  let last = 0;
  const push = (segment: string, bold: boolean) => {
    const parts = segment.split("\n");
    parts.forEach((part, index) => {
      if (index > 0) inlines.push({ type: "break" });
      if (part !== "")
        inlines.push(
          bold ? { type: "text", text: part, marks: ["bold"] } : { type: "text", text: part },
        );
    });
  };
  for (const match of text.matchAll(pattern)) {
    push(text.slice(last, match.index), false);
    push(match[1]!, true);
    last = match.index + match[0].length;
  }
  push(text.slice(last), false);
  return inlines;
}
