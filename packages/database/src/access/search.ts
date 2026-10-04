import { type ParsedContent, blocksText, plainText, validateContent } from "@medos/parsers/model";
import { type SQL, and, asc, eq, ilike, inArray, isNull, notInArray, or, sql } from "drizzle-orm";

import type { Database } from "../client";
import {
  type NewSearchEntry,
  type SearchEntryKind,
  courses,
  flashcardDecks,
  flashcards,
  lectures,
  originalLectureAnnotations,
  resourceContents,
  resources,
  searchEntries,
  studyGuideAnnotations,
  weeks,
} from "../schema";

/*
 * Search across the user's study environment (specification §26). Parsed
 * material (Study Guide sections, MCQ questions, Question Bank items) is
 * searched through a derived index, rebuilt for any resource whose content
 * changed since it was indexed; the user's own small tables (courses,
 * lectures, flashcards, notes, bookmarks) are searched directly. Every result
 * carries its course and lecture, and where in the source it is.
 */

export const SEARCH_KINDS = [
  "course",
  "lecture",
  "study-guide",
  "mcq",
  "question-bank",
  "flashcard",
  "note",
  "bookmark",
] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

export const MAX_QUERY_LENGTH = 200;
const PER_KIND = 8;
const SNIPPET = 160;

export interface SearchResult {
  kind: SearchKind;
  id: string;
  title: string;
  /** Text around the first match, when the match is not in the title alone. */
  snippet: string | null;
  course: { slug: string; name: string; shortName: string; colorToken: string | null } | null;
  lecture: { id: string; number: number; title: string; weekNumber: number } | null;
  /** Where to open it. */
  target:
    | { kind: "course" }
    | { kind: "lecture" }
    | {
        kind: "study-guide";
        resourceId: string;
        sectionId: string | null;
        annotationId: string | null;
      }
    | { kind: "original-lecture"; resourceId: string; page: number }
    | { kind: "mcq"; resourceId: string }
    | { kind: "question-bank"; resourceId: string; itemKey: string }
    | { kind: "flashcard"; deckId: string };
}

/** Lower-cased words of a query, at most eight, without LIKE wildcards' power. */
export function queryTerms(query: string): string[] {
  return [
    ...new Set(
      query
        .slice(0, MAX_QUERY_LENGTH)
        .toLowerCase()
        .split(/\s+/)
        .map((term) => term.trim())
        .filter(Boolean),
    ),
  ].slice(0, 8);
}

const escapeLike = (term: string) => term.replace(/[\\%_]/g, (char) => `\\${char}`);

/** Every term must appear in at least one of the columns. */
function matchAll(terms: readonly string[], columns: SQL[]): SQL | undefined {
  return and(
    ...terms.map((term) => or(...columns.map((column) => ilike(column, `%${escapeLike(term)}%`)))),
  );
}

/** Text around the first term found in `body`, or null when the title alone matched. */
export function snippetOf(body: string, terms: readonly string[]): string | null {
  const flat = body.replace(/\s+/g, " ").trim();
  if (flat.length === 0) return null;
  const lower = flat.toLowerCase();
  const at = Math.min(
    ...terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0),
    Number.POSITIVE_INFINITY,
  );
  if (!Number.isFinite(at)) return null;
  const start = Math.max(0, at - 50);
  const end = Math.min(flat.length, start + SNIPPET);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end).trim()}${end < flat.length ? "…" : ""}`;
}

/** How well a result matches: the whole query in the title first, then all terms in it. */
export function rank(title: string, body: string, query: string, terms: readonly string[]): number {
  const t = title.toLowerCase();
  const b = body.toLowerCase();
  const phrase = query.trim().toLowerCase();
  let score = 0;
  if (t === phrase) score += 8;
  if (t.includes(phrase)) score += 4;
  if (terms.every((term) => t.includes(term))) score += 2;
  if (b.includes(phrase)) score += 1;
  return score;
}

/** The index rows of one parsed resource. */
export function indexEntries(
  content: ParsedContent,
): Omit<NewSearchEntry, "userId" | "resourceId" | "sourceContentHash">[] {
  switch (content.format) {
    case "study-guide":
      return content.sections.map((section, position) => ({
        kind: "study-guide" as SearchEntryKind,
        anchor: section.id,
        position,
        title: plainText(section.heading).trim() || section.id,
        body: blocksText(section.blocks),
      }));
    case "mcq-set":
      return content.questions.map((question, position) => ({
        kind: "mcq" as SearchEntryKind,
        anchor: question.key,
        position,
        title: plainText(question.stem).trim() || `Question ${question.number}`,
        body: [
          plainText(question.stem),
          ...question.options.map((option) => `${option.label}. ${plainText(option.text)}`),
          question.explanation ? plainText(question.explanation) : "",
          question.topic ?? "",
        ].join("\n"),
      }));
    case "question-bank":
      return content.items.map((item, position) => ({
        kind: "question-bank" as SearchEntryKind,
        anchor: item.key,
        position,
        title: blocksText(item.prompt).trim() || `Question ${item.number ?? position + 1}`,
        body: [
          blocksText(item.prompt),
          ...item.choices.map((choice) => `${choice.label}. ${plainText(choice.text)}`),
          item.answer.status === "paired" ? blocksText(item.answer.blocks) : "",
        ].join("\n"),
      }));
    default:
      return [];
  }
}

const SEARCHABLE_FORMATS = ["study-guide", "mcq-set", "question-bank"] as const;

export function createSearchAccess(db: Database, userId: string) {
  /**
   * Brings the index up to date: resources whose parsed content is new or
   * changed are indexed again; entries of content that no longer exists go.
   */
  async function refreshIndex(): Promise<number> {
    const current = await db
      .select({
        resourceId: resourceContents.resourceId,
        hash: resourceContents.sourceContentHash,
        format: resourceContents.format,
      })
      .from(resourceContents)
      .where(
        and(
          eq(resourceContents.userId, userId),
          inArray(resourceContents.format, [...SEARCHABLE_FORMATS]),
        ),
      );
    const indexed = await db
      .selectDistinct({
        resourceId: searchEntries.resourceId,
        hash: searchEntries.sourceContentHash,
      })
      .from(searchEntries)
      .where(eq(searchEntries.userId, userId));
    const indexedHash = new Map(indexed.map((row) => [row.resourceId, row.hash]));
    const stale = current.filter((row) => indexedHash.get(row.resourceId) !== row.hash);

    // Content that is gone: its entries go too.
    const keep = current.map((row) => row.resourceId);
    await db
      .delete(searchEntries)
      .where(
        and(
          eq(searchEntries.userId, userId),
          keep.length > 0 ? notInArray(searchEntries.resourceId, keep) : undefined,
        ),
      );

    for (const row of stale) {
      const [stored] = await db
        .select({ content: resourceContents.content })
        .from(resourceContents)
        .where(
          and(eq(resourceContents.resourceId, row.resourceId), eq(resourceContents.userId, userId)),
        );
      if (!stored) continue;
      const entries = indexEntries(validateContent(stored.content));
      await db.transaction(async (tx) => {
        await tx
          .delete(searchEntries)
          .where(
            and(eq(searchEntries.resourceId, row.resourceId), eq(searchEntries.userId, userId)),
          );
        if (entries.length > 0) {
          await tx
            .insert(searchEntries)
            .values(
              entries.map((entry) => ({
                ...entry,
                userId,
                resourceId: row.resourceId,
                sourceContentHash: row.hash,
              })),
            )
            // A simultaneous search may have indexed it already.
            .onConflictDoNothing();
        }
      });
    }
    return stale.length;
  }

  const courseColumns = {
    courseSlug: courses.slug,
    courseName: courses.name,
    courseShortName: courses.shortName,
    courseColor: courses.colorToken,
  };
  const lectureColumns = {
    lectureId: lectures.id,
    lectureNumber: lectures.number,
    lectureTitle: lectures.title,
    weekNumber: weeks.number,
  };
  type Context = {
    courseSlug: string;
    courseName: string;
    courseShortName: string;
    courseColor: string | null;
    lectureId: string | null;
    lectureNumber: number | null;
    lectureTitle: string | null;
    weekNumber: number | null;
  };
  const contextOf = (row: Context) => ({
    course: {
      slug: row.courseSlug,
      name: row.courseName,
      shortName: row.courseShortName,
      colorToken: row.courseColor,
    },
    lecture:
      row.lectureId && row.lectureNumber !== null && row.lectureTitle && row.weekNumber !== null
        ? {
            id: row.lectureId,
            number: row.lectureNumber,
            title: row.lectureTitle,
            weekNumber: row.weekNumber,
          }
        : null,
  });

  return {
    refreshIndex,

    /**
     * Results for a query: every word must appear. Within each kind the best
     * matches come first; kinds come in a fixed order. At most eight per kind.
     */
    async query(query: string): Promise<SearchResult[]> {
      const terms = queryTerms(query);
      if (terms.length === 0) return [];
      await refreshIndex();
      const ordered = (rows: (SearchResult & { score: number })[]) =>
        rows
          .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
          .slice(0, PER_KIND)
          .map(({ score: _score, ...result }) => result);

      const [courseRows, lectureRows, entryRows, cardRows, guideNotes, pageNotes] =
        await Promise.all([
          db
            .select({ id: courses.id, name: courses.name, ...courseColumns })
            .from(courses)
            .where(
              and(
                eq(courses.userId, userId),
                matchAll(terms, [sql`${courses.name}`, sql`${courses.shortName}`]),
              ),
            )
            .orderBy(asc(courses.position)),
          db
            .select({ ...courseColumns, ...lectureColumns })
            .from(lectures)
            .innerJoin(weeks, eq(weeks.id, lectures.weekId))
            .innerJoin(courses, eq(courses.id, lectures.courseId))
            .where(and(eq(lectures.userId, userId), matchAll(terms, [sql`${lectures.title}`])))
            .limit(50),
          db
            .select({
              id: searchEntries.id,
              kind: searchEntries.kind,
              anchor: searchEntries.anchor,
              resourceId: searchEntries.resourceId,
              title: searchEntries.title,
              body: searchEntries.body,
              ...courseColumns,
              ...lectureColumns,
            })
            .from(searchEntries)
            .innerJoin(resources, eq(resources.id, searchEntries.resourceId))
            .innerJoin(lectures, eq(lectures.id, resources.lectureId))
            .innerJoin(weeks, eq(weeks.id, lectures.weekId))
            .innerJoin(courses, eq(courses.id, lectures.courseId))
            .where(
              and(
                eq(searchEntries.userId, userId),
                matchAll(terms, [sql`${searchEntries.title}`, sql`${searchEntries.body}`]),
              ),
            )
            .orderBy(asc(searchEntries.position))
            .limit(200),
          db
            .select({
              id: flashcards.id,
              front: flashcards.front,
              back: flashcards.back,
              deckId: flashcards.deckId,
              ...courseColumns,
              lectureId: lectures.id,
              lectureNumber: lectures.number,
              lectureTitle: lectures.title,
              weekNumber: weeks.number,
            })
            .from(flashcards)
            .innerJoin(flashcardDecks, eq(flashcardDecks.id, flashcards.deckId))
            .innerJoin(courses, eq(courses.id, flashcardDecks.courseId))
            .leftJoin(lectures, eq(lectures.id, flashcardDecks.lectureId))
            .leftJoin(weeks, eq(weeks.id, lectures.weekId))
            .where(
              and(
                eq(flashcards.userId, userId),
                isNull(flashcards.deletedAt),
                matchAll(terms, [sql`${flashcards.front}`, sql`${flashcards.back}`]),
              ),
            )
            .limit(50),
          db
            .select({
              id: studyGuideAnnotations.id,
              kind: studyGuideAnnotations.kind,
              quote: studyGuideAnnotations.quote,
              note: studyGuideAnnotations.note,
              sectionId: studyGuideAnnotations.sectionId,
              resourceId: studyGuideAnnotations.resourceId,
              ...courseColumns,
              ...lectureColumns,
            })
            .from(studyGuideAnnotations)
            .innerJoin(resources, eq(resources.id, studyGuideAnnotations.resourceId))
            .innerJoin(lectures, eq(lectures.id, resources.lectureId))
            .innerJoin(weeks, eq(weeks.id, lectures.weekId))
            .innerJoin(courses, eq(courses.id, lectures.courseId))
            .where(
              and(
                eq(studyGuideAnnotations.userId, userId),
                inArray(studyGuideAnnotations.kind, ["note", "bookmark"]),
                matchAll(terms, [
                  sql`${studyGuideAnnotations.quote}`,
                  sql`coalesce(${studyGuideAnnotations.note}, '')`,
                ]),
              ),
            )
            .limit(50),
          db
            .select({
              id: originalLectureAnnotations.id,
              kind: originalLectureAnnotations.kind,
              page: originalLectureAnnotations.page,
              note: originalLectureAnnotations.note,
              resourceId: originalLectureAnnotations.resourceId,
              filename: resources.originalFilename,
              ...courseColumns,
              ...lectureColumns,
            })
            .from(originalLectureAnnotations)
            .innerJoin(resources, eq(resources.id, originalLectureAnnotations.resourceId))
            .innerJoin(lectures, eq(lectures.id, resources.lectureId))
            .innerJoin(weeks, eq(weeks.id, lectures.weekId))
            .innerJoin(courses, eq(courses.id, lectures.courseId))
            .where(
              and(
                eq(originalLectureAnnotations.userId, userId),
                inArray(originalLectureAnnotations.kind, ["note", "bookmark"]),
                matchAll(terms, [
                  sql`coalesce(${originalLectureAnnotations.note}, '')`,
                  sql`${resources.originalFilename}`,
                  sql`${lectures.title}`,
                ]),
              ),
            )
            .limit(50),
        ]);

      const results: SearchResult[] = [];
      results.push(
        ...ordered(
          courseRows.map((row) => ({
            kind: "course" as const,
            id: row.id,
            title: row.name,
            snippet: null,
            ...contextOf({
              ...row,
              lectureId: null,
              lectureNumber: null,
              lectureTitle: null,
              weekNumber: null,
            }),
            target: { kind: "course" as const },
            score: rank(row.name, row.courseShortName, query, terms),
          })),
        ),
        ...ordered(
          lectureRows.map((row) => ({
            kind: "lecture" as const,
            id: row.lectureId,
            title: row.lectureTitle,
            snippet: null,
            ...contextOf(row),
            target: { kind: "lecture" as const },
            score: rank(row.lectureTitle, "", query, terms),
          })),
        ),
      );
      for (const kind of ["study-guide", "mcq", "question-bank"] as const) {
        results.push(
          ...ordered(
            entryRows
              .filter((row) => row.kind === kind)
              .map((row) => ({
                kind,
                id: row.id,
                title: row.title,
                snippet: snippetOf(row.body, terms),
                ...contextOf(row),
                target:
                  kind === "study-guide"
                    ? {
                        kind,
                        resourceId: row.resourceId,
                        sectionId: row.anchor,
                        annotationId: null,
                      }
                    : kind === "mcq"
                      ? { kind, resourceId: row.resourceId }
                      : { kind, resourceId: row.resourceId, itemKey: row.anchor },
                score: rank(row.title, row.body, query, terms),
              })),
          ),
        );
      }
      results.push(
        ...ordered(
          cardRows.map((row) => ({
            kind: "flashcard" as const,
            id: row.id,
            title: row.front,
            snippet: snippetOf(row.back, terms),
            ...contextOf(row),
            target: { kind: "flashcard" as const, deckId: row.deckId },
            score: rank(row.front, row.back, query, terms),
          })),
        ),
      );
      for (const kind of ["note", "bookmark"] as const) {
        results.push(
          ...ordered([
            ...guideNotes
              .filter((row) => row.kind === kind)
              .map((row) => ({
                kind,
                id: row.id,
                title: kind === "note" && row.note ? row.note : row.quote,
                snippet: kind === "note" && row.note ? snippetOf(`“${row.quote}”`, terms) : null,
                ...contextOf(row),
                target: {
                  kind: "study-guide" as const,
                  resourceId: row.resourceId,
                  sectionId: row.sectionId,
                  annotationId: row.id,
                },
                score: rank(row.note ?? row.quote, row.quote, query, terms),
              })),
            ...pageNotes
              .filter((row) => row.kind === kind)
              .map((row) => ({
                kind,
                id: row.id,
                title: row.note ?? `Page ${row.page} of ${row.filename}`,
                snippet: row.note ? `Page ${row.page} of ${row.filename}` : null,
                ...contextOf(row),
                target: {
                  kind: "original-lecture" as const,
                  resourceId: row.resourceId,
                  page: row.page,
                },
                score: rank(row.note ?? "", row.filename, query, terms),
              })),
          ]),
        );
      }
      return results;
    },
  };
}
