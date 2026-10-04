# Database

The persistence foundation built in Phase 2. `CLAUDE.md` is the specification; this file describes
what was implemented and why. For commands, see the README.

- **Database:** PostgreSQL.
- **ORM:** Drizzle ORM. **Migrations:** drizzle-kit (generated SQL, tracked in Git).
- **Package:** `packages/database` (`@medos/database`). Nothing outside it defines tables or writes
  SQL.
- **Drivers:** `postgres` for a PostgreSQL server; PGlite (PostgreSQL compiled to WebAssembly) for
  tests and for local development without an installed server. `DATABASE_URL` selects one.

## Tables

Twenty-three domain tables and one view, plus four authentication tables added in Phase 3 (described in
[`authentication.md`](authentication.md)). Only the entities listed for Phase 2 in `BUILD_PLAN.md` exist; study
guides, questions, flashcards, annotations and plans are added by their own phases.

| Table                          | One row is                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `users`                        | An owner of study data.                                                       |
| `semesters`                    | A term with its dates, exam periods and the user's lab group.                 |
| `courses`                      | A course in a semester.                                                       |
| `weeks`                        | A teaching week of a course.                                                  |
| `lectures`                     | A lecture in a week.                                                          |
| `resources`                    | An original source file attached to a lecture, with its provenance.           |
| `sync_files`                   | What the local sync tool knows about one file in the source folder.           |
| `resource_contents`            | The parsed content of a resource, with its provenance (Phase 6).              |
| `resource_media`               | An image extracted from a resource (Phase 6).                                 |
| `study_guide_annotations`      | A highlight, note, bookmark or Review Later item on a guide (Phase 7).        |
| `study_guide_progress`         | How far the user has read a guide (Phase 7). Not completion.                  |
| `original_lecture_annotations` | A bookmark, note or Review Later item on a PDF page (Phase 8).                |
| `original_lecture_positions`   | The page the user was last on in a PDF (Phase 8). Not completion.             |
| `mcq_sessions`                 | A practice session on a quiz: mode, questions, time limit (Phase 9).          |
| `mcq_attempts`                 | One answer to one question in one session (Phase 9). Never overwritten.       |
| `question_bank_attempts`       | One reveal of a Question Bank item, with the user's rating (Phase 10).        |
| `flashcard_decks`              | A deck of one course, optionally of one lecture (Phase 11).                   |
| `flashcards`                   | A card with its FSRS state; deleted cards are hidden, not removed (Phase 11). |
| `flashcard_reviews`            | One rating of one card, with the schedule before and after (Phase 11).        |
| `question_review_items`        | An MCQ or Question Bank question marked Review Later (Phase 12).              |
| `lecture_progress`             | The user's state for a lecture, including manual completion.                  |
| `study_sessions`               | A timed stretch of study: active time, pauses, last activity (Phase 13).      |
| `calendar_events`              | Anything scheduled: timetable entries, exams, holidays, study sessions.       |
| `user_settings`                | The user's own settings, such as study time per day (Phase 15).               |
| `daily_plans`                  | One day's study plan; suggested once, then the user's (Phase 15).             |
| `daily_plan_items`             | A block of a day's plan, with its reasons, order, duration and status.        |
| `difficult_concepts`           | A concept the user marked difficult, per course (Phase 16).                   |
| `search_entries`               | Search index of parsed sections and questions; derived, rebuilt on change.    |
| `exam_events`                  | Exam detail attached to a calendar event.                                     |
| `course_progress`              | _View._ Lectures and completed lectures per course.                           |

## Hierarchy

```
users
└── semesters
    └── courses
        ├── weeks
        │   └── lectures            0..n per week
        │       ├── resources       ── sync_files
        │       ├── lecture_progress
        │       └── study_sessions
        └── calendar_events ── exam_events
```

**A week is not a lecture.** `lectures.week_id` points at a week, and the only uniqueness rule is
`(week_id, number)`: a lecture's position within its week. A week can therefore hold no lectures,
one, or any number.

`lectures` also stores `course_id`, so lectures can be listed by course without joining through
weeks. It cannot disagree with the week, because the foreign key is composite:
`(week_id, course_id, user_id)` must match a row in `weeks`.

## Ownership

Every table except `users` has a `user_id`. MedOS has one user today, but scoping is part of the
schema rather than a convention:

- Each parent table has a `UNIQUE` constraint that includes `user_id`.
- Each child references its parent with a composite foreign key that includes `user_id`.

So the database itself rejects a course attached to another user's semester, or progress recorded
against another user's lecture. Queries filter by `user_id`; the constraints guarantee that doing
so is sufficient.

Since Phase 3 the owner is the authenticated user: the `users` row is the same record the
authentication framework signs in. Application code reaches study data only through
`createUserScope(db, userId)`, whose operations are all bound to one user and accept no user id.
See [`authentication.md`](authentication.md).

Phase 2 reserved a `users.auth_subject` column for the identity link. Phase 3 removed it, because
the link lives in `auth_accounts`, which supports several sign-in methods per user.

## Integrity rules

**Identifiers.** Every primary key is a random UUID generated by the database. Slugs
(`2026-fall`, `public-health`) exist for URLs and are unique within their parent, but are never
used as keys. Names and file names are never identifiers.

**Deletion.** Every foreign key on study data is `ON DELETE RESTRICT`. Deleting a semester,
course, week, lecture or resource fails while anything still depends on it, so study history
cannot disappear as a side effect. Removal is deliberate and bottom-up. The only cascading keys
are on `auth_sessions` and `auth_accounts`, which have no meaning without their user; a test
asserts that these two are the only ones.

**Uniqueness.**

| Constraint                             | Prevents                                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------------------------- |
| `users (email)`                        | Duplicate accounts.                                                                      |
| `semesters (user_id, slug)`            | The same semester twice for one user.                                                    |
| `courses (semester_id, slug)`          | The same course twice in a semester.                                                     |
| `weeks (course_id, number)`            | Duplicate teaching weeks in a course.                                                    |
| `lectures (week_id, number)`           | Two lectures in the same position of a week.                                             |
| `resources (lecture_id, content_hash)` | The same file attached to a lecture twice.                                               |
| `sync_files (user_id, relative_path)`  | Two sync records for one file.                                                           |
| `study_guide_progress (resource_id)`   | More than one progress row per guide.                                                    |
| `study_guide_annotations` (partial)    | The same highlight, bookmark or Review Later item twice on one place (notes may repeat). |
| `lecture_progress (lecture_id)`        | More than one progress row per lecture.                                                  |
| `exam_events (calendar_event_id)`      | More than one exam detail per event.                                                     |
| `study_sessions (user_id)` (partial)   | Two open study timers for one user (Phase 13; see [`study-timer.md`](study-timer.md)).   |

**Checks.** Date ranges are ordered; exam periods are either complete or absent; week and lecture
numbers start at 1; sizes and durations are not negative; content hashes are SHA-256 hex; sync
paths are relative with forward slashes; emails are lowercase; slugs are URL-safe.

**Controlled values** (resource kind and status, sync status, event type and origin, exam kind,
study activity) are `text` columns with a `CHECK`, not PostgreSQL enums. The allowed values are
defined once in `src/schema/values.ts`, which produces both the TypeScript union and the
constraint. Adding a value is an ordinary migration.

**Indexes.** Most access paths are served by the unique constraints above, whose leading column is
the parent (`courses` by semester, `weeks` by course, `lectures` by week, `resources` by lecture).
Additional indexes: `lectures (course_id)`, `calendar_events (user_id, starts_at)` for date-range
queries, `study_sessions (user_id, started_at)`, and the foreign-key columns of `calendar_events`,
`exam_events`, `study_sessions` and `sync_files`.

## Decisions worth knowing

- **Lecture completion is manual.** It lives in `lecture_progress.completed_at`, which is empty
  until the user marks the lecture complete. No code or trigger sets it from other activity.
- **Study Guide reading progress is separate.** `study_guide_progress` records how far through a
  guide the user has read; 100% is not completion and never sets it. Annotations and progress
  point at parsed content by anchor and never change it (see [`reader.md`](reader.md)).
- **Course progress is a view.** `BUILD_PLAN.md` lists CourseProgress as an entity. Storing counts
  would duplicate what `lecture_progress` already says and could drift, so `course_progress` is
  computed. If a later phase needs stored per-course state, it becomes a table then.
- **Resources describe originals.** A row records the file as it was: name, type, size, SHA-256,
  source path and storage key. Parsed content will be stored separately and derived from it. A
  failed parse only changes `status` and `processing_error`.
- **Sync paths are relative.** `sync_files.relative_path` is relative to the sync root; a `CHECK`
  rejects drive letters, leading slashes and backslashes. The `detected_*` columns are what the
  scanner inferred from the path, stored as plain values rather than references, because the
  course, week or lecture may not exist yet.
- **Time.** Instants are `timestamptz` (UTC). Academic dates are `date`, handled as `YYYY-MM-DD`
  strings. Calendar events also store the IANA `timezone` they were defined in, so they display at
  the intended local time wherever the server or browser is.
- **Exams extend calendar events.** The event carries the date and time; `exam_events` adds the
  course and kind, and is what exam scope and revision plans will attach to. A composite foreign
  key keeps the exam's course identical to the event's course.

## Seed data

`npm run db:seed` runs `seedDevelopment`, in one transaction:

1. a placeholder user (`student@medos.invalid`);
2. the Fall 2026 semester and the six courses, from the definitions in `@medos/shared`;
3. placeholder weeks 1–4 for every course, with one, one, no and two lectures.

It is **development data**. Lecture titles are generic ("Sample lecture 4.2 (development data)");
no medical content is invented. The seed matches rows on their natural keys and rewrites a row
only if it differs from the definition, so running it again changes nothing. It refuses to run
when `NODE_ENV=production`.

Accounts do not depend on the seed. `ensureWorkspace(db, userId)` runs whenever a signed-in user
opens the workspace: it creates their semester and six courses on first use (through
`seedSemester`) and otherwise costs one indexed lookup. With the `fixtureLectures` option (the
`DEV_FIXTURE_LECTURES` setting) it also adds the placeholder weeks, but only to an account with no
weeks at all. See [`academic-hierarchy.md`](academic-hierarchy.md).

## Left for later phases

- **Resource versions.** When a source file changes, how the previous original is kept alongside
  the new one is decided with the sync tool (Phase 5). The current schema allows several resources
  per lecture and never overwrites a row's file identity.
- **Row-level security.** Ownership is enforced by constraints and by the user-scoped data access
  layer. Database-level policies are not used.
- **Sync corrections screen.** The manifest (`sync_files`) has override columns
  (`override_kind`, `override_lecture_id`, `ignored`) that every sync respects; there is no screen
  for them yet. See [`sync.md`](sync.md).
