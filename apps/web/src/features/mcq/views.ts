import type { McqAttempt, McqSession } from "@medos/database";
import type { Inline, McqQuestion, McqSet, MediaRef } from "@medos/parsers/model";

/*
 * What the browser may know about questions, and what it learns after
 * answering. A question is sent without its answer, its explanations or the
 * image the source shows after answering; those are only sent as feedback,
 * once the user has answered (Learn) or submitted (Exam, USMLE).
 */

export interface ClientQuestion {
  key: string;
  number: number;
  stem: Inline[];
  options: { label: string; text: Inline[] }[];
  topic: string | null;
  questionType: string | null;
  image: MediaRef | null;
}

export interface Feedback {
  /** Null when the source states no answer, or the question was not answered. */
  correct: boolean | null;
  /** The correct option, or null when the source states none. */
  correctIndex: number | null;
  explanation: Inline[] | null;
  /** Why each option is wrong, where the source explains it (by option index). */
  optionExplanations: (Inline[] | null)[];
  /** The source's reference, e.g. a slide "S17". */
  sourceRef: string | null;
  revealImage: MediaRef | null;
}

export function toClientQuestion(question: McqQuestion): ClientQuestion {
  return {
    key: question.key,
    number: question.number,
    stem: question.stem,
    options: question.options.map(({ label, text }) => ({ label, text })),
    topic: question.topic,
    questionType: question.questionType,
    image: question.image,
  };
}

export function feedbackFor(question: McqQuestion, selected: number | null): Feedback {
  const correctIndex = question.answer.status === "resolved" ? question.answer.optionIndex : null;
  return {
    correct: selected === null || correctIndex === null ? null : selected === correctIndex,
    correctIndex,
    explanation: question.explanation,
    optionExplanations: question.options.map((option) => option.explanation),
    sourceRef: question.sourceRef,
    revealImage: question.revealImage,
  };
}

/** The session's questions, in session order, from the quiz as it is now. */
export function sessionQuestions(
  set: McqSet,
  session: Pick<McqSession, "questions">,
): McqQuestion[] {
  const byKey = new Map(set.questions.map((question) => [question.key, question]));
  return session.questions.flatMap((entry) => {
    const question = byKey.get(entry.key);
    return question ? [question] : [];
  });
}

export interface ResultItem {
  question: ClientQuestion;
  selected: number | null;
  flagged: boolean;
  timeMs: number;
  feedback: Feedback;
}

export interface Breakdown {
  label: string;
  correct: number;
  /** Questions with a stated answer (an unanswered one counts as not correct). */
  scored: number;
}

export interface Results {
  total: number;
  answered: number;
  correct: number;
  scored: number;
  /** Correct answers out of questions with a stated answer, 0–100. */
  percent: number;
  byTopic: Breakdown[];
  byType: Breakdown[];
  incorrect: string[];
  flagged: string[];
  unanswered: string[];
  elapsedSeconds: number | null;
  items: ResultItem[];
}

function breakdown(items: ResultItem[], label: (item: ResultItem) => string): Breakdown[] {
  const groups = new Map<string, Breakdown>();
  for (const item of items) {
    if (item.feedback.correctIndex === null) continue;
    const key = label(item);
    const group = groups.get(key) ?? { label: key, correct: 0, scored: 0 };
    group.scored += 1;
    if (item.feedback.correct === true) group.correct += 1;
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** The results of a session, from its attempts and the quiz as it is now. */
export function buildResults(
  set: McqSet,
  session: Pick<McqSession, "questions" | "elapsedSeconds">,
  attempts: readonly Pick<
    McqAttempt,
    "questionKey" | "selectedOption" | "flagged" | "timeSpentMs"
  >[],
): Results {
  const byKey = new Map(attempts.map((attempt) => [attempt.questionKey, attempt]));
  const items: ResultItem[] = sessionQuestions(set, session).map((question) => {
    const attempt = byKey.get(question.key);
    const selected = attempt?.selectedOption ?? null;
    return {
      question: toClientQuestion(question),
      selected,
      flagged: attempt?.flagged ?? false,
      timeMs: attempt?.timeSpentMs ?? 0,
      feedback: feedbackFor(question, selected),
    };
  });
  const scoredItems = items.filter((item) => item.feedback.correctIndex !== null);
  const correct = scoredItems.filter((item) => item.feedback.correct === true).length;
  return {
    total: items.length,
    answered: items.filter((item) => item.selected !== null).length,
    correct,
    scored: scoredItems.length,
    percent: scoredItems.length > 0 ? Math.round((correct / scoredItems.length) * 100) : 0,
    byTopic: breakdown(items, (item) => item.question.topic ?? "No topic given"),
    byType: breakdown(items, (item) => item.question.questionType ?? "No type given"),
    incorrect: items
      .filter((item) => item.feedback.correctIndex !== null && item.feedback.correct !== true)
      .map((item) => item.question.key),
    flagged: items.filter((item) => item.flagged).map((item) => item.question.key),
    unanswered: items.filter((item) => item.selected === null).map((item) => item.question.key),
    elapsedSeconds: session.elapsedSeconds,
    items,
  };
}
