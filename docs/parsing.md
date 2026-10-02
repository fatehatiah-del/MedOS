# Parsing and the resource pipeline

Phase 6 turns imported files into structured MedOS content. `CLAUDE.md` is the specification; this
file describes what was built, how it behaves, and what it deliberately does not do.

## Where it sits

```
study folder ─(read only)─▶ MedOS Sync ─▶ stored original  (.medos/objects, by SHA-256)
                                       └─▶ resources row    (lecture, kind, provenance)

stored original ─identify─▶ parser ─validate─▶ bytes match the import
                ─parse─▶ content ─normalize─▶ schema-checked model
                ─persist─▶ resource_contents + resource_media ─index─▶ search text
```

- **Parsers** (`packages/parsers`, `@medos/parsers`) are pure: bytes in, typed content out. They
  read no files, use no database and fetch nothing.
- **The pipeline** (`apps/sync/src/process`) reads MedOS's own stored copy of each original, never
  the study folder, checks its SHA-256 against the import, runs the parser, validates the result
  and stores it.
- **The web app** reads parsed content only through the user-scoped data layer
  (`scope.resources.content(id)`, and `GET /api/resources/{id}/content`). It never sees a storage
  key, local path or content hash.

A sync processes new and changed materials right after importing them. The same step can be run
on its own:

| Command                                   | What it does                                             |
| ----------------------------------------- | -------------------------------------------------------- |
| `npm run medos-sync -- process --dry-run` | Lists what would be processed, and why. Changes nothing. |
| `npm run medos-sync -- process`           | Processes new, changed and out-of-date materials.        |
| `npm run medos-sync -- process --all`     | Processes everything again, including earlier failures.  |

## Supported formats

| Material         | File    | Parser               | Becomes                                    |
| ---------------- | ------- | -------------------- | ------------------------------------------ |
| Study Guide      | `.docx` | `docx-study-guide`   | `study-guide`: sections of blocks          |
| Question Bank    | `.docx` | `docx-question-bank` | `question-bank`: question–answer items     |
| MCQ              | `.html` | `html-mcq`           | `mcq-set`: questions, choices, answers     |
| Original Lecture | `.pdf`  | `pdf-registration`   | `pdf`: page count, metadata, text per page |

The parser is chosen by the material's kind, which comes from the sync's classification and stays
authoritative, and by the file type. MCQ and Question Bank are separate parsers producing separate
formats; a Question Bank is never read as an MCQ, even when its questions have lettered choices.

Everything else is **unsupported**, with a reason the lecture page shows: `.doc` (save as `.docx`),
PowerPoint, Study Guides or Question Banks that are not `.docx`, MCQs that are not HTML, imported
flashcard files, images and supplementary files. Their originals are kept and available as before.

## Source fidelity

Imported material is the authority. The parsers:

- keep text exactly as written. The only normalisation is whitespace at the edges of a block,
  list markers typed by hand ("• ", "12.⇥"), and the quiz format's own `**bold**` convention,
  which its page renders as bold;
- never add, correct, summarise, reorder or rename anything;
- give content a semantic kind (Exam Trap, Clinical Link, Learning Objectives, …) only when the
  source labels it with that name, and keep the source's label verbatim alongside. A box with an
  unfamiliar label keeps the label and gets no kind; a box with no label gets neither;
- cut Study Guide sections at the document's own headings and build no table of contents of
  their own: the contents come from those headings;
- never guess an answer. An MCQ answer is resolved only from an index in range, a letter, or the
  exact text of exactly one choice; otherwise it is `unresolved` with the reason. A Question Bank
  answer is paired only when the source connects it unambiguously (the same number in an answers
  section, or an `A:` straight after its `Q:`); otherwise it is `missing` or `ambiguous`.

Every piece of parsed content records `origin: "source"`. The column also allows `ai-generated`,
so future AI material can never be mistaken for imported material; nothing writes it yet.

## Normalized content model

Defined with Zod in `packages/parsers/src/model` (importable alone as `@medos/parsers/model`).
Content is validated when it is written and again when it is read.

**Inline content**: text runs with marks (bold, italic, underline, superscript, subscript), line
breaks, and slide references. A slide reference is the source's own note of which lecture slides a
passage comes from (" S17", " S52– S55"), kept verbatim with the slide numbers it covers, as
provenance for future Study Guide ↔ slide links. Only references set apart at the end of a
paragraph are read this way; "HbS1" or "the S1 heart sound" stay text.

**Blocks**: paragraph · list (ordered or not, nesting level, the source's own item label) ·
table (rows, cells of blocks, header rows, column spans, merged cells) · callout (a labelled box) ·
flow (steps the source draws joined by arrows) · image · figure (images, caption, notes) ·
missing-image (an image that could not be imported, kept visible as a gap).

**`study-guide`**: title and subtitle as the document states them, a preamble (content before the
first heading, such as a hand-made contents page), and sections in source order, each with a stable
id derived from its heading, its level, its heading and its blocks.

**`mcq-set`**: questions with a stable key (`q12`), a fingerprint (SHA-256 prefix of stem and
choices, to recognise a question after a re-import), stem, choices A–Z with any explanation of why
each is wrong, the answer, the explanation, and the source's topic, question type and reference,
plus a question image and an image to reveal after answering.

**`question-bank`**: items with a key, the source's number, a fingerprint, the prompt (blocks,
including images), any lettered choices, and the answer: paired (blocks, the correct letter when it
names one of the choices, notes on wrong choices), missing, or ambiguous.

**`pdf`**: page count, the PDF's own metadata (title, author, creator, producer, creation date),
and the text of each page. The PDF itself remains the document the user reads.

## Storage

| Table               | One row is                                                                   |
| ------------------- | ---------------------------------------------------------------------------- |
| `resource_contents` | The current parsed content of one resource, with its provenance.             |
| `resource_media`    | An image extracted from a resource, stored in object storage by its SHA-256. |

`resource_contents` records the format, origin, parser and parser version, the SHA-256 of the
original it was parsed from, the content, summary counts, the parser's notes (issues), the search
text and when it was extracted. There is one row per resource: processing again replaces it, so
versions never pile up. Both tables are owned by the user through composite foreign keys, like
every study-data table, and neither cascades on delete.

Images are stored with the originals, under `sha256/<hash>`, written to a temporary name and
renamed, and accepted only if their bytes hash to their key. `resource_media` records which
resource (and so which user) each image belongs to, so a later image route can serve an image only
to the owner of a resource that uses it.

## Reprocessing

A material is processed when:

| Situation                                       | Reason shown     |
| ----------------------------------------------- | ---------------- |
| It has never been processed                     | `new`            |
| Its file changed since its content was made     | `source changed` |
| Its content was made by an older parser version | `parser updated` |
| `process --all` was run                         | `requested`      |

A sync that sees a changed file updates the same resource and marks it for processing; the earlier
original stays in storage. Until it is processed again, the lecture page says the source changed.
A material that failed is not retried on every sync (the report lists it); a changed file or
`process --all` retries it. Bump a parser's `version` in `packages/parsers/src/registry.ts`
whenever its output changes, and every resource it made is processed again on the next sync.

## Failures

A file that cannot be read never crashes the sync and never affects its original:

- the resource's status becomes `failed`, with a message written for the user ("This PDF is
  password-protected, so MedOS cannot read it."). Messages never contain paths, stack traces or
  internal detail; unexpected errors show a generic message and print their detail only in the
  terminal running the command;
- the original stays stored and attached to its lecture;
- earlier content is not deleted. If a changed file fails, the old content remains, marked as
  made from an earlier version.

Problems a parser can work around (an image in an unsupported format, a question without a stated
answer, a guide without headings) are recorded as notes on the content and counted on the lecture
page.

## Security

Imported files are untrusted.

- **HTML quizzes** are never rendered and their scripts never run. The page is only tokenised
  (htmlparser2), and the questions are read from its `<script type="application/json">` block with
  `JSON.parse`, as data. Inline handlers, styles and markup are ignored; HTML inside question text
  stays literal text. Images are taken only from embedded `data:` URLs and nothing is fetched.
- **DOCX** files are read as ZIP archives in memory. Only XML parts and images are decompressed,
  with limits on entries and total size, so a ZIP bomb cannot exhaust memory. Part names are never
  used as file paths. XML containing a DTD is refused, so entity expansion cannot apply. Macros
  (`vbaProject.bin`) and embedded objects are never opened (a note says they were ignored);
  external links and image links are never followed; field codes are dropped.
- **PDF** text and metadata are read with pdf.js 6, which evaluates no code; fonts and network
  fetches are disabled, and annotations, forms and attachments are not read.
- **Images** are accepted only as PNG, JPEG, GIF or WebP, identified from their bytes rather than
  their name or declared type. SVG is refused because it can carry script. The database enforces
  the same list.
- Parsed content is stored and served as data (JSON). Nothing is ever inserted into a page as HTML.
- Content is private: reachable only through the signed-in user's scope, with the same 401/404
  rules as resources (another user's resource is indistinguishable from a missing one) and
  `Cache-Control: private, no-store`.

## User data stays separate

Parsed content holds source material only. Notes, highlights, bookmarks, Review Later, answers,
scores, completion and review history are user data in their own tables (from Phases 7–12), so
re-importing or re-processing a file can never erase them. Processing never touches lecture
completion: a lecture is complete only when the user says so. Sections, questions and items carry
stable ids, keys and fingerprints so that later phases can anchor user data to them and recognise
the same question after a re-import.

## Real material checked

Validated against MedOS's stored copies of the Semester 5 files (in a scratch copy of the
database, so nothing real was written): the Pharmacology Week 1 Study Guide (23 sections, 9 tables,
47 labelled boxes, 13 figures, 6 flows, 13 images), MCQ quiz (40 questions, all answers resolved,
11 with images), Question Bank (40 questions, all paired; its 40 correct letters match the quiz's
40 answers exactly, from two different parsers), and both lecture PDFs (101 and 277 pages). The
ZIP in Pathophysiology Week 1 stays under review and is not unpacked.

**To verify before Phase 10:** the Question Bank was expected to hold 21 questions, but MedOS
parsed 40 items. Check the source document before building Question Bank practice; the data has
not been changed to match either number.

Automated tests use only synthetic files built in code (`@medos/parsers/testing`); no course
material is committed.

## Limitations

- Study Guides are read in the reader (Phase 7, [`reader.md`](reader.md)), which also serves
  their extracted images privately. The PDF viewer is Phase 8, the MCQ engine Phase 9 and
  Question Bank practice Phase 10.
- Text units and anchors (`model/text-units.ts`) address passages of parsed content for user
  data; they read the content and never change it.
- Only HTML quizzes that keep their questions in a JSON data block are read. Quizzes written as
  plain HTML markup are reported as unreadable rather than guessed at.
- `.doc`, PowerPoint, image-only PDFs' text, imported flashcard files and ZIP archives are not read.
- Search text is stored, but there is no search index or search screen yet (Phase 17).
- Word features without a study meaning (text boxes, comments, footnotes, headers and footers,
  colours) are not extracted.
- In DOCX files, `**` written as text stays text: Word shows it literally, so MedOS does too.
