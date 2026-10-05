import type {
  ExportAnnotation,
  ExportCard,
  ExportQuestionReview,
  ExportSnapshot,
  ExportSource,
} from "./snapshot";

/*
 * Markdown: the export to read. Highlights, notes, bookmarks, Review Later
 * questions and flashcards, grouped course → week → lecture in the order of
 * the course outline, each with the file and section it came from. Records
 * such as attempts and sessions are in the JSON and CSV files instead.
 */

const KIND_LABEL: Record<ExportAnnotation["kind"], string> = {
  highlight: "Highlight",
  note: "Note",
  bookmark: "Bookmark",
  "review-later": "Review Later",
};

/** Text that cannot start a Markdown block or break out of the list item it sits in. */
function inline(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/([\\`*_[\]<>|])/g, "\\$1");
}

/** A multi-line passage as a quote nested in a list item. */
function quoteBlock(text: string): string[] {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => `  > ${inline(line)}`.trimEnd());
}

function annotationLines(annotation: ExportAnnotation): string[] {
  const where =
    annotation.on === "lecture-page"
      ? `page ${annotation.page}`
      : (annotation.section ?? "section no longer in the Study Guide");
  const lines = [
    `- **${KIND_LABEL[annotation.kind]}** · ${inline(where)} · ${inline(annotation.source.file ?? "")}`,
  ];
  if (annotation.quote) lines.push(...quoteBlock(annotation.quote));
  if (annotation.note) lines.push(`  Note: ${inline(annotation.note)}`);
  return lines;
}

function cardLines(card: ExportCard): string[] {
  const lines = [`- **Q:** ${inline(card.front)}`, `  **A:** ${inline(card.back)}`];
  if (card.source.file) {
    const from = [card.sourceSection, card.source.file]
      .filter(Boolean)
      .map((part) => inline(part!));
    lines.push(`  From: ${from.join(" · ")}`);
  }
  return lines;
}

function questionLines(item: ExportQuestionReview): string[] {
  const lines = [
    `- ${inline(item.question ?? "This question is no longer in the file.")} · ${inline(item.source.file ?? "")}`,
  ];
  if (item.note) lines.push(`  Note: ${inline(item.note)}`);
  return lines;
}

interface Bucket {
  annotations: ExportAnnotation[];
  questions: ExportQuestionReview[];
  cards: ExportCard[];
}

const emptyBucket = (): Bucket => ({ annotations: [], questions: [], cards: [] });
const bucketKey = (source: ExportSource) => `${source.courseId}/${source.lectureId ?? ""}`;
const isEmpty = (bucket: Bucket | undefined) =>
  !bucket || bucket.annotations.length + bucket.questions.length + bucket.cards.length === 0;

function bucketLines(bucket: Bucket): string[] {
  const lines: string[] = [];
  const section = (title: string, items: string[][]) => {
    if (items.length === 0) return;
    lines.push(`#### ${title}`, "", ...items.flat(), "");
  };
  section("Highlights, notes and bookmarks", bucket.annotations.map(annotationLines));
  section("Review Later questions", bucket.questions.map(questionLines));
  section(`Flashcards (${bucket.cards.length})`, bucket.cards.map(cardLines));
  return lines;
}

/** The Markdown export. */
export function toMarkdown(snapshot: ExportSnapshot): string {
  const buckets = new Map<string, Bucket>();
  const bucketFor = (source: ExportSource) => {
    const key = bucketKey(source);
    let bucket = buckets.get(key);
    if (!bucket) buckets.set(key, (bucket = emptyBucket()));
    return bucket;
  };
  for (const annotation of snapshot.annotations)
    bucketFor(annotation.source).annotations.push(annotation);
  for (const item of snapshot.reviewLater) bucketFor(item.source).questions.push(item);
  for (const card of snapshot.flashcards.cards) {
    if (card.deletedAt === null) bucketFor(card.source).cards.push(card);
  }

  const lines = [
    "# MedOS export",
    "",
    `Exported ${snapshot.exportedAt} for ${inline(snapshot.user.displayName)} (${inline(snapshot.user.email)}).`,
    "",
  ];
  let wroteAny = false;

  for (const course of snapshot.courses) {
    const courseWide = buckets.get(`${course.id}/`);
    const lectures = course.weeks.flatMap((week) =>
      week.lectures.map((lecture) => ({
        week,
        lecture,
        bucket: buckets.get(`${course.id}/${lecture.id}`),
      })),
    );
    if (isEmpty(courseWide) && lectures.every(({ bucket }) => isEmpty(bucket))) continue;
    wroteAny = true;

    lines.push(`## ${inline(course.name)}`, "");
    if (courseWide && !isEmpty(courseWide)) {
      lines.push("### Whole course", "", ...bucketLines(courseWide));
    }
    for (const { week, lecture, bucket } of lectures) {
      if (!bucket || isEmpty(bucket)) continue;
      lines.push(
        `### Week ${week.number} · Lecture ${lecture.number}: ${inline(lecture.title)}`,
        "",
        ...bucketLines(bucket),
      );
    }
  }

  if (!wroteAny)
    lines.push("Nothing to show yet: no highlights, notes, bookmarks or flashcards.", "");
  return `${lines.join("\n").trimEnd()}\n`;
}
