import { type IsoDate, daysBetween } from "@medos/shared";

/*
 * The study planner (specification §19–20): a deterministic weighted model,
 * no AI. Every candidate block of study gets a score that is a plain sum of
 * named parts, and every part is written down as a reason the user can read.
 * The same signals always give the same plan.
 *
 * The planner only proposes. What the user then does with the plan (reorder,
 * resize, remove, postpone, ignore) is theirs and is never held against them.
 */

/** What a plan item asks the user to do. Mirrors the study timer's activities. */
export type PlanActivity =
  | "study-guide"
  | "original-lecture"
  | "mcq"
  | "question-bank"
  | "flashcards"
  | "revision"
  | "other";

export interface PlannerCourse {
  id: string;
  name: string;
  shortName: string;
}

export interface PlannerSignals {
  date: IsoDate;
  availableMinutes: number;
  courses: readonly PlannerCourse[];
  /** Courses with a lecture on the timetable today. */
  lecturedToday: readonly string[];
  /** Lectures the user has not marked complete, in teaching order within each course. */
  incompleteLectures: readonly {
    lectureId: string;
    courseId: string;
    title: string;
    weekNumber: number;
    /** When it was given, if known (from the lecture or its week). */
    heldOn: IsoDate | null;
    hasStudyGuide: boolean;
  }[];
  /** Flashcards ready for review today, per course. */
  flashcardsDue: readonly { courseId: string; due: number }[];
  /** MCQ topics answered at least a few times, with their accuracy. */
  mcqTopics: readonly {
    courseId: string;
    lectureId: string;
    resourceId: string;
    topic: string;
    answered: number;
    correct: number;
  }[];
  /** Question Bank items whose last rating was Again or Hard, per bank. */
  weakRecall: readonly { courseId: string; lectureId: string; resourceId: string; count: number }[];
  /** Items marked Review Later, per course. */
  reviewLater: readonly { courseId: string; count: number }[];
  /** Upcoming exams: a course exam, or a period (midterms, finals) for every course. */
  exams: readonly { courseId: string | null; label: string; date: IsoDate }[];
  /** Active minutes studied per course in the last seven days. */
  recentMinutes: readonly { courseId: string; minutes: number }[];
}

export interface PlanSuggestion {
  /** Stable for the same thing to study, e.g. "flashcards:<course>". */
  key: string;
  activity: PlanActivity;
  courseId: string | null;
  lectureId: string | null;
  resourceId: string | null;
  title: string;
  minutes: number;
  score: number;
  reasons: string[];
}

/** The tunable constants of the model, in one place. */
export const PLANNER_WEIGHTS = {
  /** Exam urgency ramps up over this many days before an exam. */
  examHorizonDays: 28,
  examUrgency: 40,
  lectureToday: 35,
  incompleteLecture: 15,
  recentLecture: 10,
  recentLectureDays: 14,
  flashcardsBase: 10,
  flashcardsPerCard: 0.5,
  flashcardsCardCap: 60,
  weakTopicBase: 20,
  /** An MCQ topic below this accuracy, with enough answers, is weak. */
  weakTopicAccuracy: 0.7,
  weakTopicMinAnswers: 3,
  weakRecallBase: 15,
  weakRecallPerItem: 2,
  weakRecallItemCap: 10,
  reviewLaterBase: 8,
  reviewLaterItemCap: 10,
  /** A course studied less than this in the last week gets a nudge. */
  neglectMinutes: 30,
  neglect: 5,
  /** The smallest block worth planning. */
  minimumMinutes: 10,
  maximumItems: 8,
} as const;

type Weights = typeof PLANNER_WEIGHTS;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** The nearest exam relevant to a course, and how urgent it makes the course. */
function urgency(signals: PlannerSignals, courseId: string, weights: Weights) {
  let best: { points: number; reason: string } | null = null;
  for (const exam of signals.exams) {
    if (exam.courseId !== null && exam.courseId !== courseId) continue;
    const days = daysBetween(signals.date, exam.date);
    if (days < 0 || days > weights.examHorizonDays) continue;
    const points = Math.round(weights.examUrgency * (1 - days / weights.examHorizonDays));
    const when = days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
    if (!best || points > best.points) best = { points, reason: `${exam.label} ${when}` };
  }
  return best;
}

/** All candidate blocks of study, scored, before fitting to the day. */
export function candidates(
  signals: PlannerSignals,
  weights: Weights = PLANNER_WEIGHTS,
): PlanSuggestion[] {
  const course = new Map(signals.courses.map((entry) => [entry.id, entry]));
  const recent = new Map(signals.recentMinutes.map((entry) => [entry.courseId, entry.minutes]));
  const out: PlanSuggestion[] = [];

  const add = (
    base: Omit<PlanSuggestion, "score" | "reasons">,
    parts: { points: number; reason: string }[],
  ) => {
    if (base.courseId !== null && !course.has(base.courseId)) return;
    const all = [...parts];
    if (base.courseId !== null) {
      const exam = urgency(signals, base.courseId, weights);
      if (exam) all.push(exam);
      if ((recent.get(base.courseId) ?? 0) < weights.neglectMinutes) {
        all.push({ points: weights.neglect, reason: "Little study in this course this week" });
      }
    }
    out.push({
      ...base,
      score: all.reduce((total, part) => total + part.points, 0),
      reasons: all.map((part) => part.reason),
    });
  };

  // Lectures: today's first, then the earliest unfinished one of each course.
  const lecturedToday = new Set(signals.lecturedToday);
  const byCourse = new Map<string, PlannerSignals["incompleteLectures"][number][]>();
  for (const lecture of signals.incompleteLectures) {
    byCourse.set(lecture.courseId, [...(byCourse.get(lecture.courseId) ?? []), lecture]);
  }
  for (const [courseId, lectures] of byCourse) {
    const today = lecturedToday.has(courseId);
    // After a lecture today, the newest unfinished lecture is the one just taught.
    const lecture = today ? lectures.at(-1) : lectures[0];
    if (!lecture) continue;
    const parts: { points: number; reason: string }[] = [];
    if (today) parts.push({ points: weights.lectureToday, reason: "Lecture today" });
    parts.push({ points: weights.incompleteLecture, reason: "Not marked complete" });
    if (
      lecture.heldOn &&
      daysBetween(lecture.heldOn, signals.date) >= 0 &&
      daysBetween(lecture.heldOn, signals.date) <= weights.recentLectureDays
    ) {
      parts.push({ points: weights.recentLecture, reason: "Given in the last two weeks" });
    }
    add(
      {
        key: `lecture:${lecture.lectureId}`,
        activity: lecture.hasStudyGuide ? "study-guide" : "original-lecture",
        courseId,
        lectureId: lecture.lectureId,
        resourceId: null,
        title: `${lecture.hasStudyGuide ? "Study Guide" : "Lecture"}: ${lecture.title}`,
        minutes: today ? 45 : 30,
      },
      parts,
    );
  }

  for (const entry of signals.flashcardsDue) {
    if (entry.due <= 0) continue;
    const cards = Math.min(entry.due, weights.flashcardsCardCap);
    add(
      {
        key: `flashcards:${entry.courseId}`,
        activity: "flashcards",
        courseId: entry.courseId,
        lectureId: null,
        resourceId: null,
        title: `${course.get(entry.courseId)?.shortName ?? "Course"} flashcards`,
        minutes: Math.min(40, Math.max(weights.minimumMinutes, Math.round(entry.due * 0.6))),
      },
      [
        {
          points: Math.round(weights.flashcardsBase + cards * weights.flashcardsPerCard),
          reason: `${plural(entry.due, "card")} due`,
        },
      ],
    );
  }

  // The weakest MCQ topic of each course.
  const weakest = new Map<string, PlannerSignals["mcqTopics"][number]>();
  for (const topic of signals.mcqTopics) {
    if (topic.answered < weights.weakTopicMinAnswers) continue;
    const accuracy = topic.correct / topic.answered;
    if (accuracy >= weights.weakTopicAccuracy) continue;
    const current = weakest.get(topic.courseId);
    const currentAccuracy = current ? current.correct / current.answered : 1;
    if (
      !current ||
      accuracy < currentAccuracy ||
      (accuracy === currentAccuracy && topic.topic < current.topic)
    ) {
      weakest.set(topic.courseId, topic);
    }
  }
  for (const topic of weakest.values()) {
    const percent = Math.round((topic.correct / topic.answered) * 100);
    add(
      {
        key: `mcq:${topic.resourceId}:${topic.topic}`,
        activity: "mcq",
        courseId: topic.courseId,
        lectureId: topic.lectureId,
        resourceId: topic.resourceId,
        title: `MCQ practice: ${topic.topic}`,
        minutes: 20,
      },
      [
        {
          points: Math.round(
            weights.weakTopicBase + (weights.weakTopicAccuracy * 100 - percent) / 2,
          ),
          reason: `${percent}% correct over ${plural(topic.answered, "answer")}`,
        },
      ],
    );
  }

  // The Question Bank with most weak items in each course.
  const weakBank = new Map<string, PlannerSignals["weakRecall"][number]>();
  for (const bank of signals.weakRecall) {
    if (bank.count <= 0) continue;
    const current = weakBank.get(bank.courseId);
    if (
      !current ||
      bank.count > current.count ||
      (bank.count === current.count && bank.resourceId < current.resourceId)
    ) {
      weakBank.set(bank.courseId, bank);
    }
  }
  for (const bank of weakBank.values()) {
    const items = Math.min(bank.count, weights.weakRecallItemCap);
    add(
      {
        key: `question-bank:${bank.resourceId}`,
        activity: "question-bank",
        courseId: bank.courseId,
        lectureId: bank.lectureId,
        resourceId: bank.resourceId,
        title: `${course.get(bank.courseId)?.shortName ?? "Course"} active recall`,
        minutes: 15,
      },
      [
        {
          points: weights.weakRecallBase + items * weights.weakRecallPerItem,
          reason: `${plural(bank.count, "question")} last rated Again or Hard`,
        },
      ],
    );
  }

  for (const entry of signals.reviewLater) {
    if (entry.count <= 0) continue;
    add(
      {
        key: `review-later:${entry.courseId}`,
        activity: "revision",
        courseId: entry.courseId,
        lectureId: null,
        resourceId: null,
        title: `${course.get(entry.courseId)?.shortName ?? "Course"}: Review Later items`,
        minutes: 15,
      },
      [
        {
          points: weights.reviewLaterBase + Math.min(entry.count, weights.reviewLaterItemCap),
          reason: `${plural(entry.count, "item")} marked Review Later`,
        },
      ],
    );
  }

  // Highest score first; ties broken by key so the order never depends on input order.
  return out.sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * Fits ranked suggestions into the minutes available: in order, while they
 * fit. A block that does not fit is shortened to what is left, if that is
 * still worth planning; nothing is ever planned beyond the time available.
 */
export function fitToDay(
  ranked: readonly PlanSuggestion[],
  availableMinutes: number,
  weights: Weights = PLANNER_WEIGHTS,
): PlanSuggestion[] {
  const plan: PlanSuggestion[] = [];
  let left = Math.max(0, Math.floor(availableMinutes));
  for (const suggestion of ranked) {
    if (plan.length >= weights.maximumItems || left < weights.minimumMinutes) break;
    if (suggestion.minutes <= left) {
      plan.push(suggestion);
      left -= suggestion.minutes;
    } else {
      plan.push({
        ...suggestion,
        minutes: left,
        reasons: [...suggestion.reasons, "Shortened to fit the time available"],
      });
      left = 0;
    }
  }
  return plan;
}

/** The day's suggested plan: candidates, ranked and fitted, leaving out keys already planned. */
export function suggestPlan(
  signals: PlannerSignals,
  options: { exclude?: ReadonlySet<string>; weights?: Weights } = {},
): PlanSuggestion[] {
  const weights = options.weights ?? PLANNER_WEIGHTS;
  const ranked = candidates(signals, weights).filter((item) => !options.exclude?.has(item.key));
  return fitToDay(ranked, signals.availableMinutes, weights);
}
