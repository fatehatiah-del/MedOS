import { describe, expect, it } from "vitest";

import { PLANNER_WEIGHTS, type PlannerSignals, candidates, fitToDay, suggestPlan } from "./planner";

/*
 * The planner as a pure function: deterministic, explainable, and never
 * planning more than the time available.
 */

const courses = [
  { id: "pharma", name: "Pharmacology I", shortName: "Pharmacology" },
  { id: "patho", name: "Pathology I", shortName: "Pathology" },
];

const empty: PlannerSignals = {
  date: "2026-10-07",
  availableMinutes: 150,
  courses,
  lecturedToday: [],
  incompleteLectures: [],
  flashcardsDue: [],
  mcqTopics: [],
  weakRecall: [],
  reviewLater: [],
  exams: [],
  recentMinutes: courses.map((course) => ({ courseId: course.id, minutes: 120 })),
};

const lecture = (id: string, courseId: string, week: number, heldOn: string | null = null) => ({
  lectureId: id,
  courseId,
  title: `Lecture ${id}`,
  weekNumber: week,
  heldOn: heldOn as PlannerSignals["date"] | null,
  hasStudyGuide: true,
});

describe("candidates", () => {
  it("plans nothing without signals", () => {
    expect(suggestPlan(empty)).toEqual([]);
  });

  it("puts the lecture just given first, and explains why", () => {
    const [first] = candidates({
      ...empty,
      lecturedToday: ["pharma"],
      incompleteLectures: [lecture("p1", "pharma", 1), lecture("p2", "pharma", 2, "2026-10-06")],
      flashcardsDue: [{ courseId: "patho", due: 12 }],
    });
    expect(first).toMatchObject({
      key: "lecture:p2",
      activity: "study-guide",
      minutes: 45,
      reasons: ["Lecture today", "Not marked complete", "Given in the last two weeks"],
      score:
        PLANNER_WEIGHTS.lectureToday +
        PLANNER_WEIGHTS.incompleteLecture +
        PLANNER_WEIGHTS.recentLecture,
    });
  });

  it("otherwise picks the earliest unfinished lecture of a course", () => {
    const [first] = candidates({
      ...empty,
      incompleteLectures: [lecture("p1", "pharma", 1), lecture("p2", "pharma", 2)],
    });
    expect(first?.key).toBe("lecture:p1");
  });

  it("scores flashcards by the cards due", () => {
    const [cards] = candidates({ ...empty, flashcardsDue: [{ courseId: "pharma", due: 34 }] });
    expect(cards).toMatchObject({
      key: "flashcards:pharma",
      title: "Pharmacology flashcards",
      minutes: 20,
      score: 10 + 17,
      reasons: ["34 cards due"],
    });
  });

  it("finds the weakest MCQ topic with enough answers", () => {
    const topics = candidates({
      ...empty,
      mcqTopics: [
        {
          courseId: "pharma",
          lectureId: "p1",
          resourceId: "q",
          topic: "Receptors",
          answered: 9,
          correct: 5,
        },
        {
          courseId: "pharma",
          lectureId: "p1",
          resourceId: "q",
          topic: "Kinetics",
          answered: 2,
          correct: 0,
        },
        {
          courseId: "pharma",
          lectureId: "p1",
          resourceId: "q",
          topic: "Dosing",
          answered: 10,
          correct: 8,
        },
      ],
    });
    expect(topics).toHaveLength(1);
    expect(topics[0]).toMatchObject({
      key: "mcq:q:Receptors",
      reasons: ["56% correct over 9 answers"],
    });
  });

  it("adds exam urgency to every block of the course, nearer exams weighing more", () => {
    const withExam = (date: PlannerSignals["date"]) =>
      candidates({
        ...empty,
        flashcardsDue: [{ courseId: "pharma", due: 10 }],
        exams: [{ courseId: "pharma", label: "Final exam", date }],
      })[0];
    expect(withExam("2026-10-14")?.reasons).toContain("Final exam in 7 days");
    expect(withExam("2026-10-14")!.score).toBeGreaterThan(withExam("2026-10-28")!.score);
    expect(withExam("2026-12-20")?.reasons).toEqual(["10 cards due"]);
  });

  it("applies an exam period to every course", () => {
    const blocks = candidates({
      ...empty,
      flashcardsDue: [
        { courseId: "pharma", due: 5 },
        { courseId: "patho", due: 5 },
      ],
      exams: [{ courseId: null, label: "Midterm period", date: "2026-10-08" }],
    });
    expect(blocks.every((block) => block.reasons.includes("Midterm period tomorrow"))).toBe(true);
  });

  it("nudges courses with little study this week", () => {
    const [block] = candidates({
      ...empty,
      flashcardsDue: [{ courseId: "pharma", due: 4 }],
      recentMinutes: [{ courseId: "pharma", minutes: 10 }],
    });
    expect(block?.reasons).toContain("Little study in this course this week");
  });

  it("ignores signals for courses it does not know", () => {
    expect(candidates({ ...empty, flashcardsDue: [{ courseId: "other", due: 50 }] })).toEqual([]);
  });

  it("is deterministic whatever the input order", () => {
    const signals: PlannerSignals = {
      ...empty,
      flashcardsDue: [
        { courseId: "pharma", due: 10 },
        { courseId: "patho", due: 10 },
      ],
      reviewLater: [
        { courseId: "patho", count: 3 },
        { courseId: "pharma", count: 3 },
      ],
    };
    const reversed: PlannerSignals = {
      ...signals,
      flashcardsDue: [...signals.flashcardsDue].reverse(),
      reviewLater: [...signals.reviewLater].reverse(),
    };
    expect(suggestPlan(reversed)).toEqual(suggestPlan(signals));
  });
});

describe("fitToDay", () => {
  const block = (key: string, minutes: number) => ({
    key,
    activity: "revision" as const,
    courseId: null,
    lectureId: null,
    resourceId: null,
    title: key,
    minutes,
    score: 1,
    reasons: [],
  });

  it("never plans beyond the time available, shortening the last block", () => {
    const plan = fitToDay([block("a", 60), block("b", 60), block("c", 60)], 150);
    expect(plan.map((item) => item.minutes)).toEqual([60, 60, 30]);
    expect(plan[2]?.reasons).toContain("Shortened to fit the time available");
    expect(plan.reduce((total, item) => total + item.minutes, 0)).toBeLessThanOrEqual(150);
  });

  it("drops what would be too short to be worth planning", () => {
    expect(fitToDay([block("a", 45), block("b", 30)], 50).map((item) => item.minutes)).toEqual([
      45,
    ]);
    expect(fitToDay([block("a", 30)], 0)).toEqual([]);
  });

  it("leaves out keys already in the plan", () => {
    const plan = suggestPlan(
      {
        ...empty,
        flashcardsDue: [
          { courseId: "pharma", due: 10 },
          { courseId: "patho", due: 5 },
        ],
      },
      { exclude: new Set(["flashcards:pharma"]) },
    );
    expect(plan.map((item) => item.key)).toEqual(["flashcards:patho"]);
  });
});
