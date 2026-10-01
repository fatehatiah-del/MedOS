import { buildBlocks, dropPrefix, trimInlines } from "../docx/blocks";
import { type DocxNode, type DocxParagraph, readDocx } from "../docx/reader";
import { ParseError } from "../errors";
import { fingerprint } from "../media";
import {
  type Block,
  type Inline,
  type ParseIssue,
  type QuestionBank,
  type QuestionBankAnswer,
  type QuestionBankItem,
  blocksText,
  plainText,
} from "../model";
import { capSearchText, type ParseResult } from "../result";

/*
 * Parses a Question Bank DOCX into question–answer items, for active recall.
 *
 * Two layouts are recognised, because both are common:
 *
 * 1. Numbered questions, followed by an answers section ("Answers",
 *    "Answers & explanations", "Answer key", "Model answers") whose entries
 *    use the same numbers. Questions may list lettered choices (A. … D.).
 * 2. Inline pairs: "Q:" / "Question:" paragraphs, each followed by its
 *    "A:" / "Answer:".
 *
 * An answer is attached to a question only when the source connects them
 * unambiguously. A question without an answer is kept, marked missing; a
 * number used twice is marked ambiguous. Nothing is guessed or written.
 */

const ANSWERS_HEADING =
  /^(answers?|answer key|answers? (and|&) explanations?|model answers?|suggested answers?|solutions?|answers? and rationales?)\s*:?$/i;
const NUMBERED = /^(?:Q(?:uestion)?\s*)?(\d{1,3})\s*[.):]\s*/i;
const CHOICE = /^\s*([A-H])\s*[.)]\s+/;
const QUESTION_MARKER = /^(?:Q|Question)\s*(\d{1,3})?\s*[:.)–-]\s*/i;
const ANSWER_MARKER = /^(?:A|Answer|Model answer)\s*(\d{1,3})?\s*[:.)–-]\s*/i;
const CHOICE_NOTE = /^\s*[✗✘×]\s*([A-H])\s*[:.)–-]\s*/u;
const CORRECT_LABEL = /^([A-H])\s*[—–-]\s+/;

interface DraftQuestion {
  number: number | null;
  prompt: DocxNode[];
  firstLine: Inline[];
  choices: { label: string; text: Inline[] }[];
}

interface DraftAnswer {
  number: number | null;
  firstLine: Inline[];
  rest: DocxNode[];
}

export function parseQuestionBankDocx(bytes: Uint8Array): ParseResult<QuestionBank> {
  const docx = readDocx(bytes);
  const issues: ParseIssue[] = [...docx.issues];

  const title =
    docx.body
      .find(
        (node): node is DocxParagraph => node.type === "paragraph" && node.titleRole === "title",
      )
      ?.text.trim() ||
    docx.propertiesTitle ||
    null;
  const nodes = docx.body.filter((node) => !(node.type === "paragraph" && node.titleRole !== null));

  const answersIndex = nodes.findIndex(
    (node) =>
      node.type === "paragraph" &&
      (node.headingLevel !== null || node.allBold) &&
      ANSWERS_HEADING.test(node.text.trim()),
  );

  let items: QuestionBankItem[] = [];
  if (answersIndex >= 0) {
    items = pairBySection(nodes.slice(0, answersIndex), nodes.slice(answersIndex + 1), issues);
  }
  if (items.length === 0) items = pairInline(nodes, issues);
  if (items.length === 0) {
    throw new ParseError(
      "no-questions",
      "No questions were found in this Question Bank. MedOS reads numbered questions followed by an " +
        "Answers section, or Q:/A: pairs.",
    );
  }

  const paired = items.filter((item) => item.answer.status === "paired").length;
  const unpaired = items.length - paired;
  if (unpaired > 0) {
    issues.push({
      code: "unpaired-questions",
      message:
        unpaired === 1
          ? "1 question has no answer MedOS could match with certainty."
          : `${unpaired} questions have no answer MedOS could match with certainty.`,
    });
  }

  const searchText = capSearchText(
    [
      title ?? "",
      ...items.flatMap((item) => [
        blocksText(item.prompt),
        ...item.choices.map((choice) => `${choice.label}. ${plainText(choice.text)}`),
        item.answer.status === "paired" ? blocksText(item.answer.blocks) : "",
      ]),
    ].join("\n"),
  );

  return {
    content: { format: "question-bank", title, items },
    media: docx.media.list(),
    issues,
    stats: {
      items: items.length,
      paired,
      unpaired,
      withChoices: items.filter((item) => item.choices.length > 0).length,
    },
    searchText,
  };
}

/** Layout 1: numbered questions, then an answers section with the same numbers. */
function pairBySection(
  questionNodes: readonly DocxNode[],
  answerNodes: readonly DocxNode[],
  issues: ParseIssue[],
): QuestionBankItem[] {
  const questions: DraftQuestion[] = [];
  const questionNumbers = numberer();
  for (const node of questionNodes) {
    if (node.type === "paragraph") {
      const start = questionNumbers(node);
      if (start) {
        questions.push({
          number: start.number,
          prompt: imagesOf(node),
          firstLine: trimInlines(dropPrefix(node.inlines, start.prefixLength)),
          choices: [],
        });
        continue;
      }
      const current = questions.at(-1);
      if (!current) continue;
      const choice = CHOICE.exec(node.text);
      if (choice && node.images.length === 0) {
        current.choices.push({
          label: choice[1]!.toUpperCase(),
          text: trimInlines(dropPrefix(node.inlines, choice[0].length)),
        });
        continue;
      }
      // Choices numbered by Word itself (a lettered sub-list) carry no letter in their text.
      if (
        node.numbering?.ordered &&
        node.numbering.level > 0 &&
        node.images.length === 0 &&
        node.text.trim()
      ) {
        current.choices.push({
          label: String.fromCharCode(65 + Math.min(current.choices.length, 25)),
          text: trimInlines(node.inlines),
        });
        continue;
      }
      current.prompt.push(node);
    } else {
      questions.at(-1)?.prompt.push(node);
    }
  }

  const answers: DraftAnswer[] = [];
  const answerNumbers = numberer();
  for (const node of answerNodes) {
    if (node.type === "paragraph") {
      const start = answerNumbers(node);
      if (start) {
        answers.push({
          number: start.number,
          firstLine: trimInlines(dropPrefix(node.inlines, start.prefixLength)),
          rest: imagesOf(node),
        });
        continue;
      }
    }
    answers.at(-1)?.rest.push(node);
  }

  if (questions.length === 0) return [];

  const count = (list: readonly { number: number | null }[], number: number | null) =>
    list.filter((entry) => entry.number === number).length;

  const items = questions.map((question, index): QuestionBankItem => {
    let answer: QuestionBankAnswer;
    if (count(questions, question.number) > 1) {
      answer = {
        status: "ambiguous",
        reason: `Question number ${question.number} is used more than once, so its answer cannot be matched.`,
      };
    } else if (count(answers, question.number) > 1) {
      answer = {
        status: "ambiguous",
        reason: `The answers section has more than one answer numbered ${question.number}.`,
      };
    } else {
      const found = answers.find((entry) => entry.number === question.number);
      answer = found
        ? pairedAnswer(found.firstLine, found.rest, question.choices)
        : {
            status: "missing",
            reason: `The answers section has no answer numbered ${question.number}.`,
          };
    }
    return toItem(question, index, answer);
  });

  for (const entry of answers) {
    if (count(questions, entry.number) === 0) {
      issues.push({
        code: "answer-without-question",
        message: `The answers section has an answer numbered ${entry.number}, but there is no question ${entry.number}. It was left out.`,
        location: `answer ${entry.number}`,
      });
    }
  }
  return items;
}

/** Layout 2: "Q:" paragraphs, each followed by its "A:". */
function pairInline(nodes: readonly DocxNode[], issues: ParseIssue[]): QuestionBankItem[] {
  const drafts: { question: DraftQuestion; answer: DraftAnswer | null; answers: number }[] = [];
  let target: "question" | "answer" | null = null;

  for (const node of nodes) {
    if (node.type === "paragraph") {
      const questionMatch = QUESTION_MARKER.exec(node.text);
      if (questionMatch && node.text.length > questionMatch[0].length) {
        drafts.push({
          question: {
            number: questionMatch[1] ? Number.parseInt(questionMatch[1], 10) : null,
            prompt: node.images.length > 0 ? [{ ...node, inlines: [], text: "" }] : [],
            firstLine: trimInlines(dropPrefix(node.inlines, questionMatch[0].length)),
            choices: [],
          },
          answer: null,
          answers: 0,
        });
        target = "question";
        continue;
      }
      const answerMatch = ANSWER_MARKER.exec(node.text);
      if (answerMatch && node.text.length > answerMatch[0].length) {
        const current = drafts.at(-1);
        if (!current) {
          issues.push({
            code: "answer-without-question",
            message: "An answer appears before any question. It was left out.",
          });
          continue;
        }
        current.answers += 1;
        current.answer ??= {
          number: null,
          firstLine: trimInlines(dropPrefix(node.inlines, answerMatch[0].length)),
          rest: node.images.length > 0 ? [{ ...node, inlines: [], text: "" }] : [],
        };
        target = "answer";
        continue;
      }
    }
    const current = drafts.at(-1);
    if (!current) continue;
    if (target === "answer" && current.answer && current.answers === 1)
      current.answer.rest.push(node);
    else if (target === "question") current.question.prompt.push(node);
  }

  return drafts.map(({ question, answer, answers }, index) =>
    toItem(
      question,
      index,
      answers > 1
        ? { status: "ambiguous", reason: "More than one answer follows this question." }
        : answer
          ? pairedAnswer(answer.firstLine, answer.rest, [])
          : { status: "missing", reason: "No answer follows this question." },
    ),
  );
}

/**
 * Recognises the paragraph that starts a numbered entry: a number typed in the
 * text ("12. "), or a top-level item of a list Word numbers itself, counted in
 * order within the part.
 */
function numberer() {
  let automatic = 0;
  return (node: DocxParagraph): { number: number; prefixLength: number } | null => {
    if (node.headingLevel !== null || node.text.trim() === "") return null;
    const match = NUMBERED.exec(node.text);
    if (match && node.text.length > match[0].length) {
      const number = Number.parseInt(match[1]!, 10);
      return number > 0 ? { number, prefixLength: match[0].length } : null;
    }
    if (node.numbering?.ordered && node.numbering.level === 0) {
      automatic += 1;
      return { number: automatic, prefixLength: 0 };
    }
    return null;
  };
}

/** The images of a paragraph, as a node of their own, so they stay with their question or answer. */
function imagesOf(node: DocxParagraph): DocxNode[] {
  return node.images.length > 0 ? [{ ...node, inlines: [], text: "" }] : [];
}

function pairedAnswer(
  firstLine: Inline[],
  rest: readonly DocxNode[],
  choices: readonly { label: string }[],
): QuestionBankAnswer {
  const choiceNotes: { label: string; text: Inline[] }[] = [];
  const body: DocxNode[] = [];
  for (const node of rest) {
    const note = node.type === "paragraph" ? CHOICE_NOTE.exec(node.text) : null;
    if (note && node.type === "paragraph") {
      choiceNotes.push({
        label: note[1]!.toUpperCase(),
        text: trimInlines(dropPrefix(node.inlines, node.text.indexOf(note[0]) + note[0].length)),
      });
    } else {
      body.push(node);
    }
  }

  const firstText = plainText(firstLine);
  const label = CORRECT_LABEL.exec(firstText)?.[1] ?? null;
  const correctLabel = label && choices.some((choice) => choice.label === label) ? label : null;

  const blocks: Block[] = [
    ...(firstLine.length > 0 ? [{ type: "paragraph" as const, inlines: firstLine }] : []),
    ...buildBlocks(body),
  ];
  if (blocks.length === 0) return { status: "missing", reason: "The answer is empty." };
  return { status: "paired", blocks, correctLabel, choiceNotes };
}

function toItem(
  question: DraftQuestion,
  index: number,
  answer: QuestionBankAnswer,
): QuestionBankItem {
  const prompt: Block[] = [
    ...(question.firstLine.length > 0
      ? [{ type: "paragraph" as const, inlines: question.firstLine }]
      : []),
    ...buildBlocks(
      question.prompt.filter(
        (node) => node.type !== "paragraph" || node.text !== "" || node.images.length > 0,
      ),
    ),
  ];
  const text = [
    blocksText(prompt),
    ...question.choices.map((choice) => `${choice.label}. ${plainText(choice.text)}`),
  ].join("\n");
  return {
    key: `q${index + 1}`,
    number: question.number,
    fingerprint: fingerprint(text),
    prompt,
    choices: question.choices,
    answer,
  };
}
