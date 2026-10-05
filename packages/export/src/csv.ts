import type { ExportSnapshot, ExportSource } from "./snapshot";

/*
 * CSV, one file per kind of record (RFC 4180): comma-separated, CRLF line
 * ends, a header row, and fields quoted when they contain a comma, quote or
 * line break. Files start with a UTF-8 byte order mark so spreadsheet apps
 * read accents and symbols correctly.
 *
 * A text cell that starts with =, +, -, @, tab or carriage return is prefixed
 * with an apostrophe, so a spreadsheet shows it as text instead of running
 * it as a formula. Numbers are never changed. The JSON export is the exact,
 * unaltered record.
 */

export type Cell = string | number | boolean | null;

const BOM = "﻿";
const FORMULA_START = /^[=+\-@\t\r]/;

/** One CSV field: guarded against formulas, quoted when needed. */
export function csvField(value: Cell): string {
  if (value === null) return "";
  if (typeof value !== "string") return String(value);
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** A CSV file: header row, then one row per record. */
export function toCsv<T>(
  columns: readonly [string, (row: T) => Cell][],
  rows: readonly T[],
): string {
  const lines = [
    columns.map(([name]) => csvField(name)).join(","),
    ...rows.map((row) => columns.map(([, value]) => csvField(value(row))).join(",")),
  ];
  return `${BOM}${lines.join("\r\n")}\r\n`;
}

/** The provenance columns every lecture-linked file carries. */
function sourceColumns<T>(of: (row: T) => ExportSource | null): [string, (row: T) => Cell][] {
  return [
    ["course", (row) => of(row)?.course ?? null],
    ["week", (row) => of(row)?.week ?? null],
    ["lecture", (row) => of(row)?.lecture ?? null],
    ["lecture_title", (row) => of(row)?.lectureTitle ?? null],
    ["file", (row) => of(row)?.file ?? null],
  ];
}

/** Every CSV file of the export, by file name. */
export function toCsvFiles(snapshot: ExportSnapshot): Record<string, string> {
  type S = ExportSnapshot;
  const lectures = snapshot.courses.flatMap((course) =>
    course.weeks.flatMap((week) => week.lectures.map((lecture) => ({ course, week, lecture }))),
  );
  const planItems = snapshot.planner.days.flatMap((day) =>
    day.items.map((item) => ({ date: day.date, item })),
  );

  return {
    "lectures.csv": toCsv<(typeof lectures)[number]>(
      [
        ["lecture_id", (row) => row.lecture.id],
        ["course", (row) => row.course.name],
        ["week", (row) => row.week.number],
        ["lecture", (row) => row.lecture.number],
        ["title", (row) => row.lecture.title],
        ["held_on", (row) => row.lecture.heldOn],
        ["completed_at", (row) => row.lecture.completedAt],
      ],
      lectures,
    ),

    "annotations.csv": toCsv<S["annotations"][number]>(
      [
        ["id", (row) => row.id],
        ["on", (row) => row.on],
        ["kind", (row) => row.kind],
        ...sourceColumns<S["annotations"][number]>((row) => row.source),
        ["section", (row) => row.section],
        ["page", (row) => row.page],
        ["quote", (row) => row.quote],
        ["note", (row) => row.note],
        ["created_at", (row) => row.createdAt],
        ["updated_at", (row) => row.updatedAt],
      ],
      snapshot.annotations,
    ),

    "flashcards.csv": toCsv<S["flashcards"]["cards"][number]>(
      [
        ["id", (row) => row.id],
        ["deck_id", (row) => row.deckId],
        ["deck", (row) => row.deck],
        ...sourceColumns<S["flashcards"]["cards"][number]>((row) => row.source),
        ["front", (row) => row.front],
        ["back", (row) => row.back],
        ["origin", (row) => row.origin],
        ["source_section", (row) => row.sourceSection],
        ["source_quote", (row) => row.sourceQuote],
        ["state", (row) => row.fsrs.state],
        ["due", (row) => row.fsrs.due],
        ["stability", (row) => row.fsrs.stability],
        ["difficulty", (row) => row.fsrs.difficulty],
        ["scheduled_days", (row) => row.fsrs.scheduledDays],
        ["learning_steps", (row) => row.fsrs.learningSteps],
        ["reps", (row) => row.fsrs.reps],
        ["lapses", (row) => row.fsrs.lapses],
        ["last_review", (row) => row.fsrs.lastReview],
        ["deleted_at", (row) => row.deletedAt],
        ["created_at", (row) => row.createdAt],
      ],
      snapshot.flashcards.cards,
    ),

    "flashcard_reviews.csv": toCsv<S["flashcards"]["reviews"][number]>(
      [
        ["id", (row) => row.id],
        ["card_id", (row) => row.cardId],
        ["rating", (row) => row.rating],
        ["reviewed_at", (row) => row.reviewedAt],
        ["duration_ms", (row) => row.durationMs],
        ["state_before", (row) => row.stateBefore],
        ["due_before", (row) => row.dueBefore],
        ["state_after", (row) => row.stateAfter],
        ["due_after", (row) => row.dueAfter],
        ["stability_after", (row) => row.stabilityAfter],
        ["difficulty_after", (row) => row.difficultyAfter],
        ["scheduled_days_after", (row) => row.scheduledDaysAfter],
      ],
      snapshot.flashcards.reviews,
    ),

    "mcq_sessions.csv": toCsv<S["mcq"]["sessions"][number]>(
      [
        ["id", (row) => row.id],
        ...sourceColumns<S["mcq"]["sessions"][number]>((row) => row.source),
        ["mode", (row) => row.mode],
        ["status", (row) => row.status],
        ["question_count", (row) => row.questionCount],
        ["shuffled", (row) => row.shuffled],
        ["time_limit_seconds", (row) => row.timeLimitSeconds],
        ["started_at", (row) => row.startedAt],
        ["submitted_at", (row) => row.submittedAt],
        ["elapsed_seconds", (row) => row.elapsedSeconds],
      ],
      snapshot.mcq.sessions,
    ),

    "mcq_attempts.csv": toCsv<S["mcq"]["attempts"][number]>(
      [
        ["id", (row) => row.id],
        ["session_id", (row) => row.sessionId],
        ...sourceColumns<S["mcq"]["attempts"][number]>((row) => row.source),
        ["mode", (row) => row.mode],
        ["question_number", (row) => row.question?.number ?? null],
        ["question", (row) => row.question?.stem ?? null],
        ["topic", (row) => row.question?.topic ?? null],
        ["selected_option", (row) => row.selectedOption],
        ["correct_option", (row) => row.question?.correctOption ?? null],
        ["correct", (row) => row.correct],
        ["flagged", (row) => row.flagged],
        ["time_spent_ms", (row) => row.timeSpentMs],
        ["attempt_number", (row) => row.attemptNumber],
        ["answered_at", (row) => row.answeredAt],
        ["question_key", (row) => row.questionKey],
      ],
      snapshot.mcq.attempts,
    ),

    "question_bank_attempts.csv": toCsv<S["questionBank"]["attempts"][number]>(
      [
        ["id", (row) => row.id],
        ...sourceColumns<S["questionBank"]["attempts"][number]>((row) => row.source),
        ["question", (row) => row.question],
        ["typed_answer", (row) => row.typedAnswer],
        ["model_answer", (row) => row.modelAnswer],
        ["rating", (row) => row.rating],
        ["revealed_at", (row) => row.revealedAt],
        ["rated_at", (row) => row.ratedAt],
        ["time_spent_ms", (row) => row.timeSpentMs],
        ["attempt_number", (row) => row.attemptNumber],
        ["item_key", (row) => row.itemKey],
      ],
      snapshot.questionBank.attempts,
    ),

    "review_later_questions.csv": toCsv<S["reviewLater"][number]>(
      [
        ["id", (row) => row.id],
        ...sourceColumns<S["reviewLater"][number]>((row) => row.source),
        ["question", (row) => row.question],
        ["note", (row) => row.note],
        ["created_at", (row) => row.createdAt],
        ["question_key", (row) => row.questionKey],
      ],
      snapshot.reviewLater,
    ),

    "study_guide_progress.csv": toCsv<S["progress"]["studyGuides"][number]>(
      [
        ...sourceColumns<S["progress"]["studyGuides"][number]>((row) => row.source),
        ["furthest_section", (row) => row.furthestSection],
        ["furthest_position", (row) => row.furthestPosition],
        ["section_count", (row) => row.sectionCount],
        ["updated_at", (row) => row.updatedAt],
      ],
      snapshot.progress.studyGuides,
    ),

    "lecture_pdf_positions.csv": toCsv<S["progress"]["originalLectures"][number]>(
      [
        ...sourceColumns<S["progress"]["originalLectures"][number]>((row) => row.source),
        ["page", (row) => row.page],
        ["updated_at", (row) => row.updatedAt],
      ],
      snapshot.progress.originalLectures,
    ),

    "study_sessions.csv": toCsv<S["studySessions"][number]>(
      [
        ["id", (row) => row.id],
        ["activity", (row) => row.activity],
        ...sourceColumns<S["studySessions"][number]>((row) => row.source),
        ["started_at", (row) => row.startedAt],
        ["ended_at", (row) => row.endedAt],
        ["active_seconds", (row) => row.activeSeconds],
      ],
      snapshot.studySessions,
    ),

    "calendar.csv": toCsv<S["calendar"][number]>(
      [
        ["id", (row) => row.id],
        ["type", (row) => row.type],
        ["origin", (row) => row.origin],
        ["title", (row) => row.title],
        ["course", (row) => row.source?.course ?? null],
        ["starts_at", (row) => row.startsAt],
        ["ends_at", (row) => row.endsAt],
        ["all_day", (row) => row.allDay],
        ["time_zone", (row) => row.timeZone],
        ["location", (row) => row.location],
        ["student_group", (row) => row.studentGroup],
        ["exam", (row) => row.exam],
        ["notes", (row) => row.notes],
      ],
      snapshot.calendar,
    ),

    "plan_items.csv": toCsv<(typeof planItems)[number]>(
      [
        ["date", (row) => row.date],
        ["position", (row) => row.item.position],
        ["title", (row) => row.item.title],
        ["activity", (row) => row.item.activity],
        ["minutes", (row) => row.item.minutes],
        ["status", (row) => row.item.status],
        ["origin", (row) => row.item.origin],
        ...sourceColumns<(typeof planItems)[number]>((row) => row.item.source),
        ["reasons", (row) => row.item.reasons.join("; ")],
        ["postponed_from", (row) => row.item.postponedFrom],
      ],
      planItems,
    ),

    "difficult_concepts.csv": toCsv<S["difficultConcepts"][number]>(
      [
        ["id", (row) => row.id],
        ["course", (row) => row.source.course],
        ["label", (row) => row.label],
        ["created_at", (row) => row.createdAt],
      ],
      snapshot.difficultConcepts,
    ),
  };
}
