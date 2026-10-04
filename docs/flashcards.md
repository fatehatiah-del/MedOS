# Flashcards and FSRS

Phase 11 adds flashcards with spaced repetition. `CLAUDE.md` §14–15 and `BUILD_PLAN.md` Phase 11
are the specification; this file describes what was built.

## Where it is

| Address                                     | Shows                                                              |
| ------------------------------------------- | ------------------------------------------------------------------ |
| `/flashcards` (sidebar)                     | Each course: cards due, new and total; its decks; a new-deck form. |
| `/flashcards/<course>/decks/<deck>`         | A deck: add, edit and delete cards; review this deck.              |
| `/flashcards/<course>/review[?deck=<deck>]` | A review session for one course, or one deck of it.                |

On a lecture page, the Flashcards card opens the lecture's deck (**Start this lecture's deck** the
first time) and shows its card and due counts. That is information only: it never completes the
lecture.

## Decks and cards

- Every deck belongs to **one course**. A lecture gets its own deck, made the first time it is
  needed ("Week 1 · Lecture 1"); you can also make course-level decks by name. The database
  refuses a lecture deck whose lecture belongs to another course.
- A card has a front (the question) and a back (the answer), plain text with line breaks, up to
  5000 characters each.
- **Delete** asks first. A deleted card disappears from decks and reviews; its review history is
  kept.

### From the Study Guide

Select text in the Study Guide and choose **Create flashcard**. The editor opens with the **back
prefilled with the passage, verbatim**, and the front empty for you to write the question. Nothing
is generated (there is no AI) and nothing is saved until you choose **Save flashcard**. The card
goes into the lecture's deck and keeps the passage as its source (guide, section, text unit,
offsets and quote, checked against the guide like a highlight); **From the Study Guide** on the
deck page and **Open the Study Guide passage** in review link back to it.

## Review

- A session is always **one course**, or one deck of it. MedOS never mixes courses.
- Due cards come first (longest overdue first), then new cards in the order they were made, up to
  **20 new cards per course per day**. The day starts at midnight in the semester's time zone
  (Europe/Berlin).
- Each card: the front, then **Show answer** (Space), then Again / Hard / Good / Easy (keys 1–4).
  Each button shows when the card would come back ("1 min", "10 min", "8 d").
- A card due again within 20 minutes (Again on a new card, for example) comes back in the same
  session.

## Scheduling

Cards are scheduled with **FSRS** through [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs)
(MIT), behind a small wrapper (`packages/fsrs`, `@medos/fsrs`) so the algorithm can be replaced or
tuned without touching the rest of MedOS. Settings: 90% desired retention, standard parameters, no
interval fuzz (the same history always gives the same schedule). Each card stores its due date,
stability, difficulty, scheduled interval, learning step, review and lapse counts, state (new,
learning, review, relearning) and last review; retrievability is computed from them.

## Data

| Table               | One row is                                                                     |
| ------------------- | ------------------------------------------------------------------------------ |
| `flashcard_decks`   | A deck of one course, optionally the deck of one lecture.                      |
| `flashcards`        | A card: front, back, origin, Study Guide source, FSRS state, deletion time.    |
| `flashcard_reviews` | One rating of one card: when, how long it took, and the schedule before/after. |

Owned like every study-data table (`user_id`, composite foreign keys, `ON DELETE RESTRICT`).
Reviews are never changed. The data is shaped for Anki export later (Phase 20): plain front and
back text, with origin and source kept separately.

## Tests

- **Scheduler** (`packages/fsrs`): new cards, ordered intervals, determinism, growth and lapses,
  retrievability, interval labels.
- **Database** (`packages/database/src/access/flashcards.test.ts`): lecture and course decks,
  the deck/course rule, cards from a Study Guide checked against the guide, deletion keeping
  history, FSRS reviews, never mixing courses, the daily new-card limit, privacy.
- **Web** (`apps/web/src/features/flashcards/logic.test.ts`): the start of the day in the semester's
  time zone, and the Server Function logic.
- **End to end** (`apps/web/e2e/flashcards.spec.ts`, desktop and mobile): writing, editing and
  deleting cards, creating one from a Study Guide selection, a course review that leaves out
  another course's cards and stops showing cards once rated, completion unchanged, overflow,
  accessibility in both themes, privacy.

## Not in Phase 11

- AI card generation (stays disabled until an AI provider exists).
- Images or cloze cards; formatting beyond line breaks.
- Global annotation pages (Phase 12), statistics (Phase 16), Anki import and export (Phase 20).
