import { describe, expect, it } from "vitest";

import {
  LECTURE_CATEGORIES,
  availableCategoryLabels,
  categoryStateLabel,
  lectureCategoryStates,
} from "./categories";

describe("lecture categories", () => {
  it("are the five separate kinds of study material, in order", () => {
    expect(LECTURE_CATEGORIES.map((category) => category.label)).toEqual([
      "Study Guide",
      "Original Lecture",
      "MCQ",
      "Question Bank",
      "Flashcards",
    ]);
    // MCQ and Question Bank are distinct categories backed by distinct kinds.
    const kinds = LECTURE_CATEGORIES.map((category) => category.resourceKind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it("are empty when no material is attached, and never assumed available", () => {
    const states = lectureCategoryStates([]);
    expect(states.map((category) => category.state.status)).toEqual([
      "empty",
      "empty",
      "empty",
      "empty",
      "empty",
    ]);
    expect(categoryStateLabel({ status: "empty" })).toBe("No material imported yet");
  });

  it("count the files of each kind separately", () => {
    const states = lectureCategoryStates([
      { kind: "study-guide" },
      { kind: "mcq" },
      { kind: "mcq" },
      { kind: "image" },
    ]);
    const byId = new Map(states.map((category) => [category.id, category.state]));

    expect(byId.get("study-guide")).toEqual({ status: "available", files: 1 });
    expect(byId.get("mcq")).toEqual({ status: "available", files: 2 });
    expect(byId.get("question-bank")).toEqual({ status: "empty" });
    expect(categoryStateLabel({ status: "available", files: 2 })).toBe("2 files");
  });

  it("count imported flashcard files like any other material", () => {
    const states = lectureCategoryStates([{ kind: "flashcards" }]);
    expect(states.find((category) => category.id === "flashcards")?.state).toEqual({
      status: "available",
      files: 1,
    });
  });

  it("name only the categories that have material", () => {
    expect(availableCategoryLabels(["mcq", "study-guide", "image"])).toEqual([
      "Study Guide",
      "MCQ",
    ]);
    expect(availableCategoryLabels([])).toEqual([]);
  });
});
