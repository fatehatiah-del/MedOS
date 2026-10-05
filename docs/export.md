# Export and backup

Your data in open formats (specification §37, BUILD_PLAN Phase 20). **Settings → Export and backup**
downloads it; nothing in the export needs MedOS to be read.

| Download          | File                                   | What it is                                                                    |
| ----------------- | -------------------------------------- | ----------------------------------------------------------------------------- |
| Everything (.zip) | `medos-export-YYYY-MM-DD.zip`          | All of the below, plus a `README.txt` explaining each file.                   |
| JSON              | `medos-export-YYYY-MM-DD.json`         | Every record, exactly as stored. The complete, lossless export.               |
| CSV (.zip)        | `medos-export-YYYY-MM-DD-csv.zip`      | One spreadsheet per kind of record, under `csv/`.                             |
| Markdown          | `medos-export-YYYY-MM-DD.md`           | Highlights, notes, bookmarks, Review Later questions and flashcards, to read. |
| Anki (.txt)       | `medos-flashcards-anki-YYYY-MM-DD.txt` | Flashcards for Anki's File → Import.                                          |

Each is a `GET /api/export?format=all|json|csv|markdown|anki`. Signed out it answers 401; an unknown
format is a 400. The response is an attachment, `Cache-Control: private, no-store`, never sniffed,
and holds only the signed-in user's data: the snapshot is read through their user scope.

## What is exported

- the course outline (semester → course → week → lecture) with lecture completion;
- highlights, notes, bookmarks and Review Later marks on Study Guides (the passage, the text around
  it, the section) and on lecture PDF pages (the page);
- flashcard decks, cards (with the Study Guide section and passage a card was made from), each
  card's FSRS state, and the full review history. Deleted cards are kept, with `deletedAt`, so their
  reviews still make sense; the Markdown and Anki files leave them out;
- MCQ sessions and every attempt, with the question as the quiz states it (stem, options, correct
  option, topic, slide reference), the option chosen and whether it was right;
- Question Bank attempts with the question, the source's model answer, what you typed and your
  rating; Review Later questions with their note;
- Study Guide reading progress and the last page of each lecture PDF;
- study sessions (activity, times, active seconds);
- calendar events and exams, with their time zone;
- daily plans and their items, your study availability, and difficult concepts.

**Not exported:** sign-in sessions and accounts, sync bookkeeping, the search index (rebuilt from the
rest), and the original files: they are in your own study folder, and the export names each one
with its SHA-256.

## Provenance

Every item that belongs to a lecture carries a `source`:

```json
{
  "courseId": "…",
  "course": "Pharmacology I",
  "courseSlug": "pharmacology",
  "week": 3,
  "lectureId": "…",
  "lecture": 2,
  "lectureTitle": "GPCR signalling",
  "resourceId": "…",
  "resourceKind": "study-guide",
  "file": "StudyGuide.docx",
  "fileContentHash": "<sha-256 of the file>"
}
```

So a flashcard reads Study Guide section → `StudyGuide.docx` → lecture → week → course, and an MCQ
attempt `Quiz.html` → lecture → week → course. Course-level items (a course deck, a session without
a lecture, an exam) have the course and nulls below it. In the CSV files the same appears as the
`course`, `week`, `lecture`, `lecture_title` and `file` columns.

A question that is no longer in its file after a re-import is found by its fingerprint if it moved;
if it is gone, the attempt is exported with `question: null` and its key and fingerprint, never
matched to a different question. A parsed file that cannot be read is treated the same way: the
export never fails because of one.

## Format

`medos-export.json` starts with `"format": "medos-export"` and `"schemaVersion": 1`. Instants are ISO
8601 in UTC, calendar dates `YYYY-MM-DD`, ids the database's UUIDs (so a review still points at its
card and an attempt at its session). The types are in `packages/export/src/snapshot.ts`; removing or
renaming a field is a new schema version.

CSV follows RFC 4180: comma-separated, CRLF line ends, a header row, fields quoted when they contain
a comma, quote or line break, UTF-8 with a byte order mark so Excel reads accents. A text cell that
starts with `=`, `+`, `-`, `@`, tab or carriage return is prefixed with `'` so a spreadsheet shows it
instead of running it as a formula. Numbers are never changed; the JSON is unaltered.

## Anki

`flashcards-anki.txt` is Anki's "Notes in Plain Text" with header lines, so the import needs no
settings (Anki 2.1.55 or later): tab-separated, HTML fields, the Basic note type.

- Deck: `MedOS::<course>::<deck>`, so courses stay separate decks.
- Tags: `MedOS::<course-slug>::week-<n>::lecture-<n>`, plus `MedOS::from-study-guide` for cards made
  from a Study Guide.
- GUID: the card's MedOS id, so importing a newer export updates the same notes.

Scheduling is not carried into Anki (it starts the cards as new); the full FSRS state and review log
are in the JSON for a future two-way sync.

## Code

| Where                                             | What                                                              |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| `packages/database/src/access/export.ts`          | `scope.export.snapshot()`: the user's records as one snapshot.    |
| `packages/export/src/snapshot.ts`                 | The format's types and version.                                   |
| `packages/export/src/{csv,markdown,anki}.ts`      | The writers. Pure functions of a snapshot.                        |
| `packages/export/src/archive.ts`                  | `exportFile(snapshot, kind)`: the download, zipped with `fflate`. |
| `apps/web/src/features/export/export-response.ts` | The private response; `app/api/export/route.ts` calls it.         |

Tests: `packages/export/src/export.test.ts` (escaping, formula guard, CSV read back with a strict
RFC 4180 reader, Anki lines, Markdown grouping, zip contents),
`packages/database/src/access/export.test.ts` (another user's data never appears, provenance,
questions read from the file or left out once gone, JSON round trip),
`apps/web/src/features/export/export-response.test.ts` (401, 400, headers) and
`apps/web/e2e/export.spec.ts` (every download from Settings, parsed).
