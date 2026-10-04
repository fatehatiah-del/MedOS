/*
 * The weakness engine (specification §28): evidence, not scores. A topic or
 * lecture is listed as weak only when a stated rule is met by the user's own
 * activity, and it is shown with exactly the signals that met it. There is no
 * mastery score, blended index or estimate: the evidence is the output.
 */

export type WeaknessSignal =
  | "mcq-accuracy"
  | "repeated-errors"
  | "flashcard-lapses"
  | "weak-recall"
  | "review-later"
  | "marked-difficult";

/** One scored MCQ question with everything the user answered on it. */
export interface QuestionStat {
  courseId: string;
  lectureId: string;
  resourceId: string;
  fingerprint: string;
  topic: string | null;
  answered: number;
  correct: number;
}

/** Signals that belong to a lecture rather than a topic. */
export interface LectureStat {
  lectureId: string;
  courseId: string;
  title: string;
  flashcardLapses: number;
  /** Question Bank items whose latest rating is Again or Hard. */
  weakRecall: number;
  reviewLater: number;
}

/** A concept the user marked as difficult themselves. */
export interface DifficultConcept {
  id: string;
  courseId: string;
  label: string;
}

export interface WeaknessInput {
  questions: readonly QuestionStat[];
  lectures: readonly LectureStat[];
  difficult: readonly DifficultConcept[];
}

export interface Evidence {
  signal: WeaknessSignal;
  text: string;
}

export interface Weakness {
  key: string;
  kind: "topic" | "lecture" | "concept";
  label: string;
  courseId: string;
  lectureId: string | null;
  /** Every signal that met its rule, in a fixed order. Never empty. */
  evidence: Evidence[];
  /** Further facts that explain the item but did not by themselves make it weak. */
  context: string[];
  /** The concept the user marked, when there is one (so it can be unmarked). */
  difficultId: string | null;
}

/** The rules, in one place. Each is a plain threshold on a count or a share. */
export const WEAKNESS_RULES = {
  /** A topic below this share of correct answers, with enough answers, is weak. */
  accuracyBelow: 0.7,
  minimumAnswers: 3,
  /** A question answered wrong at least this many times is a repeated error. */
  repeatedWrong: 2,
  /** A lecture with at least this many flashcard lapses is weak. */
  lapses: 3,
  /** A lecture with at least this many Question Bank items last rated Again or Hard. */
  weakRecall: 2,
  /** A lecture with at least this many Review Later items. */
  reviewLater: 2,
} as const;

type Rules = typeof WEAKNESS_RULES;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const normal = (label: string) => label.trim().toLowerCase().replace(/\s+/g, " ");
const percent = (correct: number, answered: number) => Math.round((correct / answered) * 100);

/** The weak topics, lectures and marked concepts, strongest evidence first. */
export function detectWeaknesses(input: WeaknessInput, rules: Rules = WEAKNESS_RULES): Weakness[] {
  const out: Weakness[] = [];
  const difficultBy = new Map(
    input.difficult.map((concept) => [`${concept.courseId}|${normal(concept.label)}`, concept]),
  );
  const usedConcepts = new Set<string>();

  // Topics: MCQ questions grouped by course and topic.
  interface TopicTotal {
    courseId: string;
    label: string;
    lectures: Set<string>;
    answered: number;
    correct: number;
    repeated: number;
  }
  const topics = new Map<string, TopicTotal>();
  const untagged = new Map<string, { answered: number; correct: number; repeated: number }>();
  for (const question of input.questions) {
    const repeated = question.answered - question.correct >= rules.repeatedWrong ? 1 : 0;
    if (question.topic) {
      const key = `${question.courseId}|${normal(question.topic)}`;
      const total = topics.get(key) ?? {
        courseId: question.courseId,
        label: question.topic.trim(),
        lectures: new Set<string>(),
        answered: 0,
        correct: 0,
        repeated: 0,
      };
      total.lectures.add(question.lectureId);
      total.answered += question.answered;
      total.correct += question.correct;
      total.repeated += repeated;
      topics.set(key, total);
    } else {
      const total = untagged.get(question.lectureId) ?? { answered: 0, correct: 0, repeated: 0 };
      total.answered += question.answered;
      total.correct += question.correct;
      total.repeated += repeated;
      untagged.set(question.lectureId, total);
    }
  }

  const weakTopicsByLecture = new Map<string, string[]>();
  for (const [key, topic] of topics) {
    const evidence: Evidence[] = [];
    if (
      topic.answered >= rules.minimumAnswers &&
      topic.correct / topic.answered < rules.accuracyBelow
    ) {
      evidence.push({
        signal: "mcq-accuracy",
        text: `MCQ accuracy: ${percent(topic.correct, topic.answered)}% (${plural(topic.answered, "answer")})`,
      });
    }
    if (topic.repeated > 0) {
      evidence.push({
        signal: "repeated-errors",
        text: `Repeated errors: ${plural(topic.repeated, "question")} answered wrong more than once`,
      });
    }
    const concept = difficultBy.get(key);
    if (concept) {
      usedConcepts.add(concept.id);
      evidence.push({ signal: "marked-difficult", text: "Marked difficult by you" });
    }
    if (evidence.length === 0) continue;
    const lectureId = topic.lectures.size === 1 ? [...topic.lectures][0]! : null;
    for (const lecture of topic.lectures) {
      weakTopicsByLecture.set(lecture, [...(weakTopicsByLecture.get(lecture) ?? []), topic.label]);
    }
    out.push({
      key: `topic:${key}`,
      kind: "topic",
      label: topic.label,
      courseId: topic.courseId,
      lectureId,
      evidence,
      context:
        evidence[0]?.signal === "mcq-accuracy"
          ? []
          : [
              `MCQ accuracy: ${percent(topic.correct, topic.answered)}% (${plural(topic.answered, "answer")})`,
            ],
      difficultId: concept?.id ?? null,
    });
  }

  for (const lecture of input.lectures) {
    const evidence: Evidence[] = [];
    const mcq = untagged.get(lecture.lectureId);
    if (
      mcq &&
      mcq.answered >= rules.minimumAnswers &&
      mcq.correct / mcq.answered < rules.accuracyBelow
    ) {
      evidence.push({
        signal: "mcq-accuracy",
        text: `MCQ accuracy on questions without a topic: ${percent(mcq.correct, mcq.answered)}% (${plural(mcq.answered, "answer")})`,
      });
    }
    if (mcq && mcq.repeated > 0) {
      evidence.push({
        signal: "repeated-errors",
        text: `Repeated errors: ${plural(mcq.repeated, "question")} without a topic answered wrong more than once`,
      });
    }
    if (lecture.flashcardLapses >= rules.lapses) {
      evidence.push({
        signal: "flashcard-lapses",
        text: `Flashcard lapses: ${lecture.flashcardLapses}`,
      });
    }
    if (lecture.weakRecall >= rules.weakRecall) {
      evidence.push({
        signal: "weak-recall",
        text: `Question Bank: ${plural(lecture.weakRecall, "question")} last rated Again or Hard`,
      });
    }
    if (lecture.reviewLater >= rules.reviewLater) {
      evidence.push({ signal: "review-later", text: `Review Later items: ${lecture.reviewLater}` });
    }
    if (evidence.length === 0) continue;
    const weakTopics = weakTopicsByLecture.get(lecture.lectureId);
    out.push({
      key: `lecture:${lecture.lectureId}`,
      kind: "lecture",
      label: lecture.title,
      courseId: lecture.courseId,
      lectureId: lecture.lectureId,
      evidence,
      context: weakTopics ? [`Weak topics in this lecture: ${weakTopics.join(", ")}`] : [],
      difficultId: null,
    });
  }

  for (const concept of input.difficult) {
    if (usedConcepts.has(concept.id)) continue;
    out.push({
      key: `concept:${concept.id}`,
      kind: "concept",
      label: concept.label.trim(),
      courseId: concept.courseId,
      lectureId: null,
      evidence: [{ signal: "marked-difficult", text: "Marked difficult by you" }],
      context: [],
      difficultId: concept.id,
    });
  }

  // More independent signals first; then a fixed order by kind, label and key.
  const kindOrder = { topic: 0, lecture: 1, concept: 2 } as const;
  return out.sort(
    (a, b) =>
      b.evidence.length - a.evidence.length ||
      kindOrder[a.kind] - kindOrder[b.kind] ||
      a.label.localeCompare(b.label) ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
}
