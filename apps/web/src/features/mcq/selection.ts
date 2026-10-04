import type { McqMode } from "@medos/database";
import type { McqQuestion, McqSet } from "@medos/parsers/model";

/*
 * Which questions a session asks, and in what order. Questions are only ever
 * taken from the imported quiz; nothing is generated.
 */

/**
 * Question types USMLE mode uses, as the source labels them (CLAUDE.md §11):
 * clinical vignettes and questions on mechanism, consequence and application.
 */
export const USMLE_TYPES = [
  "vignette",
  "clinical",
  "mechanism",
  "consequence",
  "application",
] as const;

/** Seconds per question for a timed exam, unless the user chooses otherwise. */
export const DEFAULT_SECONDS_PER_QUESTION = 90;

const normalise = (value: string | null) => value?.trim().toLowerCase() ?? "";

export function isUsmleQuestion(question: McqQuestion): boolean {
  return (USMLE_TYPES as readonly string[]).includes(normalise(question.questionType));
}

/** The topics of a quiz in the order they first appear, with question counts. */
export function quizTopics(set: McqSet): { topic: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const question of set.questions) {
    if (question.topic) counts.set(question.topic, (counts.get(question.topic) ?? 0) + 1);
  }
  return [...counts].map(([topic, count]) => ({ topic, count }));
}

/** USMLE priority: clinical vignettes first, then the other USMLE types, in source order. */
function usmleRank(question: McqQuestion): number {
  const type = normalise(question.questionType);
  return type === "vignette" || type === "clinical" ? 0 : 1;
}

export interface SelectionOptions {
  mode: McqMode;
  /** Only questions of this topic, or all. */
  topic: string | null;
  /** At most this many questions, or all. */
  count: number | null;
  shuffle: boolean;
  /** Source of randomness for shuffling (injectable for tests). */
  random?: () => number;
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other] as T, result[index] as T];
  }
  return result;
}

/** The keys of the questions a session asks, in order. Empty when none match. */
export function selectQuestions(set: McqSet, options: SelectionOptions): string[] {
  const random = options.random ?? Math.random;
  let questions = set.questions.filter(
    (question) => options.topic === null || question.topic === options.topic,
  );
  if (options.mode === "usmle") {
    questions = questions
      .filter(isUsmleQuestion)
      .sort((x, y) => usmleRank(x) - usmleRank(y) || x.number - y.number);
  }
  // Learn mode always follows the source's order.
  if (options.shuffle && options.mode !== "learn") questions = shuffled(questions, random);
  if (options.count !== null && options.count > 0) questions = questions.slice(0, options.count);
  return questions.map((question) => question.key);
}

export const MODE_LABELS = { learn: "Learn", exam: "Exam", usmle: "USMLE" } as const;
