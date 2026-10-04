# Using MedOS on your own

This guide is for using MedOS day to day, without any development help. MedOS is not finished
(see "What is not built yet"), but everything listed under "What you can do" works and is tested.

## Start and stop

**Start:** double-click **MedOS** on your Desktop (or `Start MedOS.cmd` in
`C:\Users\fateh\Documents\MedOs`). A black window opens and, after about 10 seconds, your browser
opens MedOS at **http://localhost:3000**. The first page load after starting can take up to a
minute while MedOS prepares itself; later pages are quick.

**Keep the black window open** while you use MedOS. **To stop MedOS**, close that window.

**Sign in** with fatehatiah@gmail.com and your password (or Google, if you set it up). Everything is
stored on this computer only.

MedOS runs on this computer, so it is not reachable from your phone or another computer yet; that
comes with deployment (the last phase).

## What you can do

| Where                                       | What                                                                                                                                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Courses** → a course → a lecture          | Everything for a lecture in one place, and **Mark lecture complete** (only you ever complete a lecture).                                                                                     |
| Lecture → **Open Study Guide**              | Read the guide with contents, figures and tables. Select text to Highlight, Add note, Bookmark, Review later or Create flashcard. Reading progress is shown; it never completes the lecture. |
| Lecture → **Open lecture**                  | The original lecture PDF: pages, zoom, fullscreen, page bookmarks, notes and Review later, resume where you left off, download.                                                              |
| Lecture → **Practise MCQ**                  | Learn mode (answer and explanation after each question), Exam mode (timed, results at the end), USMLE mode.                                                                                  |
| Lecture → **Practise recall**               | Question Bank: think or type your answer, reveal the model answer, rate Again / Hard / Good / Easy.                                                                                          |
| Lecture → **Open deck** / **Flashcards**    | Write flashcards (or create them from Study Guide text), then **Review** one course at a time. Scheduling is automatic (FSRS).                                                               |
| Sidebar → **Question Bank**, **Flashcards** | All your banks and decks by course.                                                                                                                                                          |
| Top right → theme                           | Light, dark or system theme.                                                                                                                                                                 |

Keyboard shortcuts are shown under each practice screen (for example A–D to answer, Space to show a
flashcard's answer, 1–4 to rate).

## What is not built yet

These pages exist but are placeholders or show sample data: **Today** (the schedule and plan shown
are sample data), **Calendar**, **Study Plan**, **Review**, **Search**, **Statistics**, and parts of
**Settings**. There is no study timer, no global list of all your notes and highlights, no export,
and no AI. They are the remaining phases (12–22) in `BUILD_PLAN.md`.

## Your data and backups

- Your study data (progress, notes, highlights, answers, cards, reviews) is in
  `C:\Users\fateh\Documents\MedOs\.medos\pgdata`.
- Copies of your imported files and their images are in `C:\Users\fateh\Documents\MedOs\.medos\objects`.
- **Never delete the `.medos` folder.** Your study folder (`Downloads\S5`) is only ever read; MedOS
  never changes it.

**Backups made so far** (one before each upgrade) are in `.medos\backups`, for example
`pgdata-before-phase11`.

**To make your own backup:** stop MedOS (close the black window), then copy the folder
`.medos\pgdata` to somewhere safe (for example `.medos\backups\pgdata-my-backup-<date>`, or a USB
stick). Copying while MedOS runs may give an unusable copy.

**To restore a backup:** stop MedOS, rename `.medos\pgdata` to `.medos\pgdata-old`, copy the backup
folder to `.medos\pgdata`, and start MedOS. Anything you did after that backup is not in it.

## Importing new material (when you decide to)

You decided to wait with new files until deployment. When you want to import them anyway (for
example the Pathophysiology Anemias files now in `Downloads\S5\Pathophysiology\w1`):

1. Stop MedOS (close the black window): the import needs the database to itself.
2. Open **Command Prompt**, then run:

   ```
   cd /d C:\Users\fateh\Documents\MedOs
   npm run medos-sync -- sync --dry-run --source "C:\Users\fateh\Downloads\S5" --user fatehatiah@gmail.com
   ```

   This **only shows** what would happen. Read it.

3. If it looks right, run the same command without `--dry-run`. New files are copied into MedOS and
   read (Study Guides, quizzes, question banks, PDFs). Nothing in your S5 folder is changed, and
   nothing you already did in MedOS is lost.
4. Start MedOS again.

Folder layout MedOS understands: `S5\<course>\w<week>\[lecture-1\]<files>`, for example
`S5\Pharma\w2\Pharmacology_StudyGuide.docx`. More detail: `docs/sync.md`.

## Troubleshooting

| Problem                                            | What to do                                                                                                                    |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| "The embedded database is open in another process" | MedOS is already running (or an import is). Close the other black window, then try again.                                     |
| The browser shows "can't reach this page"          | MedOS is still starting. Wait 10–20 seconds and reload. If the black window shows an error, close and restart it.             |
| It says port 3000 is in use                        | MedOS is probably already running in another window: use that one, or close it and start again.                               |
| A page shows "Something went wrong"                | Reload the page. If it keeps happening, stop and start MedOS.                                                                 |
| You forgot your password                           | There is no password reset yet (MedOS has no email). Sign in with Google if it is set up; otherwise it needs a technical fix. |
| "Node.js is not installed"                         | Install Node.js 22 or newer from https://nodejs.org, then start MedOS again.                                                  |

## For a developer picking this up

Read `README.md`, `CLAUDE.md` (the specification) and `BUILD_PLAN.md` (the phases). Phases 0–11 are
complete and committed; each phase has a document in `docs/`. `npm run validate` runs every check.
