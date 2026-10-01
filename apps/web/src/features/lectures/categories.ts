import type { ResourceKind } from "@medos/database";

/**
 * The five kinds of study material a lecture can have. They are separate on
 * purpose: an MCQ quiz is not a question bank, and flashcards are not a file.
 */
export type LectureCategoryId =
  "study-guide" | "original-lecture" | "mcq" | "question-bank" | "flashcards";

export interface LectureCategory {
  id: LectureCategoryId;
  label: string;
  description: string;
  /** The resource kind whose files belong to this category. */
  resourceKind: ResourceKind;
  /** What to show with no files: "empty" (nothing imported yet) or "later" (feature not built yet). */
  whenEmpty?: "empty" | "later";
}

export const LECTURE_CATEGORIES: readonly LectureCategory[] = [
  {
    id: "study-guide",
    label: "Study Guide",
    description: "Your structured notes for this lecture, read section by section.",
    resourceKind: "study-guide",
  },
  {
    id: "original-lecture",
    label: "Original Lecture",
    description: "The university's own slides or document, kept as it was.",
    resourceKind: "original-lecture",
  },
  {
    id: "mcq",
    label: "MCQ",
    description: "Multiple-choice questions, in learn, exam and USMLE modes.",
    resourceKind: "mcq",
  },
  {
    id: "question-bank",
    label: "Question Bank",
    description: "Open questions for active recall, rated Again, Hard, Good or Easy.",
    resourceKind: "question-bank",
  },
  {
    id: "flashcards",
    label: "Flashcards",
    description: "Cards you write or create from the study guide, reviewed within this course.",
    resourceKind: "flashcards",
    // Imported card files can exist already; writing and reviewing cards comes later.
    whenEmpty: "later",
  },
];

export type CategoryState =
  { status: "available"; files: number } | { status: "empty" } | { status: "later" };

export interface CategoryWithState extends LectureCategory {
  state: CategoryState;
}

/**
 * What exists for each category, from the lecture's resources. A category is
 * "available" only when material is actually attached; nothing is assumed.
 */
export function lectureCategoryStates(
  resources: readonly { kind: ResourceKind }[],
): CategoryWithState[] {
  return LECTURE_CATEGORIES.map((category) => {
    const files = resources.filter((resource) => resource.kind === category.resourceKind).length;
    const state: CategoryState =
      files > 0 ? { status: "available", files } : { status: category.whenEmpty ?? "empty" };
    return { ...category, state };
  });
}

export function categoryStateLabel(state: CategoryState): string {
  switch (state.status) {
    case "available":
      return state.files === 1 ? "1 file" : `${state.files} files`;
    case "empty":
      return "No material imported yet";
    case "later":
      return "Arrives in a later phase";
  }
}

/** Labels of the categories with material, for a compact line in lists. */
export function availableCategoryLabels(kinds: readonly ResourceKind[]): string[] {
  return LECTURE_CATEGORIES.filter((category) => kinds.includes(category.resourceKind)).map(
    (category) => category.label,
  );
}
