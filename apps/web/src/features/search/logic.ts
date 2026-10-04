import {
  MAX_QUERY_LENGTH,
  type SearchKind,
  type SearchResult,
  type UserScope,
} from "@medos/database";
import { z } from "zod";

import { courseHref } from "@/config/navigation";
import {
  lectureHref,
  mcqHref,
  originalLectureHref,
  questionBankHref,
  studyGuideHref,
} from "@/features/courses/progress";

/*
 * Search as the browser calls it: the query is untrusted text, the results
 * are the user's own, and each comes with the address of its source.
 */

export const KIND_LABELS: Record<SearchKind, string> = {
  course: "Course",
  lecture: "Lecture",
  "study-guide": "Study Guide",
  mcq: "MCQ",
  "question-bank": "Question Bank",
  flashcard: "Flashcard",
  note: "Note",
  bookmark: "Bookmark",
};

export interface SearchHit extends Omit<SearchResult, "target"> {
  href: string;
}

/** Where a result opens. */
export function hrefFor(result: SearchResult): string {
  const { target, course, lecture } = result;
  const slug = course?.slug ?? "";
  const lectureId = lecture?.id ?? "";
  switch (target.kind) {
    case "course":
      return courseHref(slug);
    case "lecture":
      return lectureHref(slug, result.id);
    case "study-guide": {
      const base = studyGuideHref(slug, lectureId, target.resourceId);
      if (target.annotationId) return `${base}?annotation=${target.annotationId}`;
      return target.sectionId ? `${base}#${encodeURIComponent(target.sectionId)}` : base;
    }
    case "original-lecture":
      return `${originalLectureHref(slug, lectureId, target.resourceId)}?page=${target.page}`;
    case "mcq":
      return mcqHref(slug, lectureId, target.resourceId);
    case "question-bank":
      return `${questionBankHref(slug, lectureId, target.resourceId)}?item=${target.itemKey}`;
    case "flashcard":
      return `/flashcards/${slug}/decks/${target.deckId}`;
  }
}

export async function search(scope: UserScope, input: unknown): Promise<SearchHit[]> {
  const parsed = z.object({ query: z.string().max(MAX_QUERY_LENGTH) }).safeParse(input);
  if (!parsed.success) return [];
  const results = await scope.search.query(parsed.data.query);
  return results.map(({ target, ...result }) => ({
    ...result,
    href: hrefFor({ ...result, target }),
  }));
}
