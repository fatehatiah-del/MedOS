# MedOS Sync

MedOS Sync is the local companion that brings your study folder into MedOS. It runs on your own
computer, reads the folder, and writes to the MedOS database and to MedOS's own storage. It never
writes to the study folder.

## Why it is a separate tool

A hosted website cannot read folders on your computer. So the web app never touches your files:
it shows what the sync has recorded. The sync is a command you run deliberately on the machine
that has the folder.

```
your study folder ──read only──▶ MedOS Sync ──▶ MedOS database   (structure, materials, manifest)
                                             └─▶ MedOS storage    (a copy of each original file)
```

Today the sync writes to the database in `DATABASE_URL` and copies originals into a local folder.
When MedOS is hosted, the same pipeline will send the results to the hosted backend instead; only
the last step changes. The web app never depends on a Windows drive.

## The source folder is never modified

This is a guarantee, not a convention:

- The scanner (`apps/sync/src/scan/walk.ts`) is the only code that touches the source folder, and
  it only lists folders, reads file metadata and opens files for reading. Symbolic links are not
  followed.
- Copies of originals go to the storage folder, which the sync refuses to place inside the
  source folder (or vice versa).
- Nothing is ever created in the source folder: no manifest, no hidden files, no metadata. The
  record of what was seen lives in the database (`sync_files`).
- Tests compare every file's name, size, modification time and SHA-256 before and after scans,
  dry runs and repeated syncs, and run a sync on a folder whose files are all read-only.

HTML files are hashed and copied as bytes; they are never opened in a browser or executed.

## Setting it up

Add three lines to `apps/web/.env.local` (git-ignored):

```
MEDOS_SOURCE_DIR=C:\Users\yourname\Downloads\S5
MEDOS_SYNC_USER=you@example.com
# Optional. Defaults to .medos/objects in the repository.
# MEDOS_STORAGE_DIR=D:\MedOS\objects
```

- `MEDOS_SOURCE_DIR`: your study folder. Required; there is no built-in default path.
- `MEDOS_SYNC_USER`: the email of your MedOS account. Sign up in the app first.
- `MEDOS_STORAGE_DIR`: where copies of originals are kept.

`--source` and `--user` override the first two for a single run.

**Stop the MedOS dev server first** when using the embedded database. The database folder can
only be open in one process at a time. Whichever process opens it first holds a lock
(`<database folder>.lock`), and the other refuses to open it rather than risk damaging it, with a
message saying so.

## Commands

| Command                                | What it does                                             |
| -------------------------------------- | -------------------------------------------------------- |
| `npm run medos-sync -- scan`           | Shows what the folder contains. Uses no database.        |
| `npm run medos-sync -- sync --dry-run` | Shows exactly what a sync would change. Changes nothing. |
| `npm run medos-sync -- sync`           | Imports, then reads new and changed materials.           |
| `npm run medos-sync -- process`        | Reads imported materials into content (`--all`: all).    |
| `npm run medos-sync -- status`         | Shows what earlier syncs recorded.                       |
| `npm run medos-sync -- --help`         | Help.                                                    |

Add `--verbose` to list every file with its classification, the full structure, and skipped files.

Always run a dry run first. A sync applies migrations to the database before writing, so it never
writes to an outdated schema.

If the account has development placeholder lectures, a real sync stops and asks for
`--remove-placeholders`, which deletes them (and their completion records) before importing.

## How folders are read

Expected layout: `<course>/<week>/[<lecture>/]…/<file>`.

### Courses

The top-level folder name is matched against each course's name, short name and aliases, ignoring
case, spacing, punctuation, "&" versus "and", and a trailing "I":

| Course                 | Folder names recognised (examples)                                        |
| ---------------------- | ------------------------------------------------------------------------- |
| Pathology I            | Pathology, Path                                                           |
| Pathophysiology I      | Pathophysiology, Pathophys, Pathophysio                                   |
| Medical Microbiology I | Microbiology, Micro, Medical Microbiology                                 |
| Pharmacology I         | Pharmacology, Pharma, Pharm                                               |
| Public & Global Health | Public Health, PublicHealth, public-health, Public and Global Health, PGH |
| Communication Skills   | Communication Skills, Communication, Communications, communication-skills |

Aliases are defined once, in `packages/shared/src/courses.ts`, and each belongs to exactly one
course (a test enforces this). Public Health and Communication Skills never share a name. Names
are matched whole, never by prefix: "Patho" could be Pathology or Pathophysiology, so it is not
recognised, is reported with the expected names, and nothing in it is imported. If two folders
match the same course, neither is imported until one remains.

The course is recorded by its id; the folder name is kept exactly as it is on disk, and relative
paths always use it. An alias such as "Pharma" is only ever a folder name the source happens to
use — MedOS never shortens a folder name.

An empty course folder is valid. `scan` counts courses with material and empty courses
separately and lists the empty ones; no weeks or lectures are created for them.

### Weeks

`w1`, `W1`, `w01`, `week1`, `week 1`, `Week 01`, `week-1`, `week_1`, `Wk 3` and `Week 4 - Topic`
are all read as week numbers. Any other folder directly inside a course is reported. Two folders
for the same week number are both held back. Empty week folders become weeks without lectures.

### Lectures

Inside a week, in order of precedence:

1. **Lecture folders.** Every subfolder that is not a material folder (`MCQ`, `Study Guide`,
   `Slides` …) is a lecture. `lecture-1`, `Lecture 2 - Renal`, `L3` and `Lec 04` are ordered by
   their number; other names follow alphabetically. Files lying directly in the week next to
   lecture folders go to review.
2. **Lecture numbers in file names**, such as `Lecture 2 Study Guide.docx`. Each distinct number
   is a lecture. Unnumbered files go to review when there are two or more lectures, and join the
   lecture when there is only one.
3. Otherwise **the whole week is one lecture**.

Lectures are numbered 1, 2, 3 within their week in that order, whatever numbers the source used;
the source's label ("Lecture 5", or the folder's description) becomes the lecture's title. Titles
are set only when a lecture is created, so a title you change later is never overwritten.

Multiple lectures in one week always stay separate lectures.

### Material kinds

1. **Names first.** The file name and any folders between the lecture and the file are checked
   for Study Guide, Question Bank (or QBank, QB), MCQ (or Quiz, Multiple choice) and Flashcards
   (or Anki). A name with more than one of these is ambiguous and goes to review.
2. A name mentioning lecture, slides, presentation or handout marks the **Original Lecture**.
3. Otherwise, **documented defaults by file type**: PDF, PPT, PPTX → Original Lecture; DOC, DOCX →
   Study Guide; HTML, HTM → MCQ; images → Image.
4. Anything else (plain text, CSV, unknown types with no telling name) is **not guessed**: it goes
   to review.

MCQ and Question Bank are separate kinds and are never merged. The manifest records whether each
kind was read from the name ("explicit") or from a default ("inferred"), with the reason.

### Supported files

`.pdf .doc .docx .ppt .pptx .html .htm .txt .md .csv .tsv .png .jpg .jpeg .gif .webp`.

Other files are kept on record for review, not imported. Operating-system and temporary files
(`Thumbs.db`, `desktop.ini`, `.DS_Store`, `~$` Office lock files, hidden files, `.tmp`,
`.crdownload`, `.part`) are skipped and counted.

## What a sync records

For every file, `sync_files` (the manifest) records:

| Recorded                             | Example                                                 |
| ------------------------------------ | ------------------------------------------------------- |
| Path relative to the source          | `Pharma/w4/lecture-1/study-guide.docx`                  |
| SHA-256, size, modified time         |                                                         |
| Detected course, week, lecture, kind | `pharmacology`, 4, 1, `study-guide`                     |
| Why                                  | `lecture folder "lecture-1"; the name says Study Guide` |
| Status                               | `synced`, `needs-review`, `missing`, `ignored`          |
| Last sync                            |                                                         |
| Material it became                   | the resource id                                         |

Each attached file becomes a **resource** of its lecture, with its original name, type, size,
SHA-256, relative source path and storage key. Together they answer: which original file, which
course, week and lecture, which kind, when it was imported, and whether it has changed since.

Only paths relative to the source folder are stored. The absolute path appears only in the
command's own output on your computer; it is never stored in the database or sent to the web app
(tested).

## Repeated syncs

The identity of a file is its relative path; its content is identified by SHA-256.

| Situation                       | What happens                                                                                          |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Unchanged                       | Nothing. Reported as unchanged.                                                                       |
| New file                        | Imported.                                                                                             |
| Changed content, same path      | The same material record is updated, marked for re-processing; the earlier original stays in storage. |
| Same content, new place or kind | The material is re-filed (moved to the right lecture or kind).                                        |
| File gone                       | Marked `missing`. Its material, the lecture and everything you did stay.                              |
| File back                       | Marked synced again and reconnected to its material.                                                  |
| Same content twice              | Stored once.                                                                                          |

Running a sync twice on an unchanged folder creates nothing (tested). A sync never deletes weeks,
lectures, materials or study data, and never touches lecture completion, notes or any other user
data.

## Corrections

Automatic classification is a proposal. Each manifest row has three override columns that every
later sync respects and never overwrites:

- `override_kind`: use this kind instead.
- `override_lecture_id`: attach to this lecture instead.
- `ignored`: leave the file out.

There is no screen for these yet; they can be set with `npm run db:studio`. Splitting a week into
lectures is done by giving the source folder lecture subfolders, or with `override_lecture_id`.

## Storage

The store is `@medos/storage` (`packages/storage`), shared with the web app, which reads
extracted images from it to show them in the Study Guide reader. Originals are copied to `<storage>/sha256/<first two characters>/<sha256>`. The folder is
git-ignored. Copies are written to a temporary name and renamed, so an interrupted sync never
leaves a partial file. They are never modified or deleted by a sync.

## After importing: parsing

Since Phase 6 a sync reads each new or changed material from MedOS's stored copy (never from the
study folder) into structured content: Study Guide sections, MCQ questions, Question Bank items,
and PDF page registration. The report ends with a **Processing** section. A file that cannot be
read is reported with a plain reason and its original stays stored and attached. See
[`parsing.md`](parsing.md).

## What is not done yet

- **Uploading to a hosted MedOS.** The sync writes to the configured database and local storage.
- **A screen for corrections and review.**
