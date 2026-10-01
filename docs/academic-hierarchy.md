# Courses, weeks and lectures

The navigable academic structure built in Phase 4. `CLAUDE.md` §4 defines it; this file describes
how it is implemented.

## Hierarchy

```
Semester (Fall 2026, Semester 5, Group A)
└── Course            six per semester, each its own study environment
    └── Week          numbered from 1; holds 0..n lectures
        └── Lecture   numbered within its week; the unit of completion
            └── Material: Study Guide · Original Lecture · MCQ · Question Bank · Flashcards
```

A week is never a lecture. A week can hold no lectures, one, or several; lectures are numbered
within their week (`Week 4 → Lecture 1, Lecture 2`), never by week number. Weeks are ordered by
number and lectures by their number within the week, so the order is the same on every request.

All of it lives in the database (`semesters`, `courses`, `weeks`, `lectures`) and belongs to the
signed-in user. The six courses are created for an account the first time it opens the workspace
(`ensureWorkspace`), from the definitions in `@medos/shared`: Pathology I, Pathophysiology I,
Medical Microbiology I, Pharmacology I, Public & Global Health, and Communication Skills. Public &
Global Health and Communication Skills are separate courses with separate weeks and lectures.

The sidebar, the Today screen and the course pages all read the user's courses from the database,
so they cannot disagree.

## Routes

| Route                                          | Shows                                                   |
| ---------------------------------------------- | ------------------------------------------------------- |
| `/courses`                                     | The six courses with lecture counts and progress.       |
| `/courses/<course-slug>`                       | Progress, "Continue with", and the weeks with lectures. |
| `/courses/<course-slug>/lectures/<lecture-id>` | The lecture hub.                                        |

- Courses are addressed by their slug (`pharmacology`, `public-health`), which is stable and
  URL-safe. Display names are never used in addresses.
- Lectures are addressed by their UUID, so the address survives renaming and reordering. The
  course slug in the address must be the lecture's own course; anything else is "not found".
- Every route is private. Unknown courses, unknown lectures, malformed ids and another user's
  lectures all show the same not-found page.

## The lecture hub

- Breadcrumbs: Courses › Course › Week.
- The lecture's course, week and position ("Lecture 2 of 2").
- Completion, with the button to change it.
- The five kinds of study material, each in its own place. A kind is "available" only when
  material of that kind is attached; today every lecture shows "No material imported yet", and
  Flashcards "Arrives in a later phase". Nothing is a link until there is something to open.
- The other lectures of the same week.

## Completion

Completion is a decision the user makes, and nothing else changes it.

- **Mark lecture complete** records the moment in `lecture_progress.completed_at` for the signed-in
  user. **Mark as incomplete** clears it. Either can be undone at any time; nothing is deleted.
- Opening a lecture, reading material, attaching files, answering questions or studying for a long
  time never changes completion. Tests check that opening a lecture and attaching material leave
  it incomplete.
- The action is a Server Function (`features/lectures/actions.ts`). It verifies the session
  itself, reads only a lecture id and a flag from the request, and applies the change through the
  user-scoped data layer. A user id sent by the browser is ignored; another user's lecture is
  "not found".
- Completion belongs to the user, not to the lecture. Two users never share lecture rows, and one
  user's decisions are invisible to everyone else.

## Progress

The lecture is the only unit, and the user's decisions are the only input.

- **Course:** completed lectures ÷ lectures. Empty weeks add nothing. A course without lectures
  shows "No lectures yet" rather than 0%.
- **Week:** "1 of 2 complete", "Complete", "1 lecture" or "No lectures yet".
- **Continue with:** the first lecture, in week and lecture order, that is not complete. It is a
  "where was I", not a recommendation; study planning comes later.

Material availability never affects progress.

The course list is loaded in one query for all courses, and a course outline (weeks, lectures,
completion and material kinds) in one relational query, so page cost does not grow with the number
of weeks.

## Development data

Until the sync tool imports real material, accounts have courses but no weeks or lectures. For
development, `DEV_FIXTURE_LECTURES=true` gives an account without any weeks the same placeholder
structure in every course:

| Week | Lectures |
| ---- | -------- |
| 1    | 1        |
| 2    | 1        |
| 3    | 0        |
| 4    | 2        |

Placeholders are titled "Sample lecture 4.2 (development data)", contain no medical content, and
every course, course list and lecture page that shows them carries a "Development preview" notice.
They are created once per account, never mixed into an account that already has weeks, and never
overwrite an existing lecture. The E2E tests enable the flag; production should not.

## Relationship to the S5 import

MedOS Sync (Phase 5, see [`sync.md`](sync.md)) maps the source folder onto this structure:

```
S5\<subject>\w4\lecture-2\StudyGuide.docx
   └ course   └ week └ lecture   └ resource (kind: study-guide)
```

- The subject folder maps to a course slug (with aliases such as `Pharma` → `pharmacology`).
- `w4` maps to week number 4 of that course; a week with several lectures uses one folder per
  lecture.
- Files become `resources` of the lecture, with their relative path, hash and kind recorded.

Folder paths are provenance, never identifiers: rows keep their UUIDs if folders are renamed.
Before the first real import, the sync removes placeholder lectures when run with
`--remove-placeholders`; they are identified by their title prefix (`FIXTURE_LECTURE_PREFIX`).
