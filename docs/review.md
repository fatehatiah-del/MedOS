# Review: notes, highlights, bookmarks and Review Later

Phase 12 brings everything you mark while studying into one place, and adds Review Later to
questions. `CLAUDE.md` §9, §16 and `BUILD_PLAN.md` Phase 12 are the specification; this file
describes what was built.

## Where it is

| Address             | Shows                                                             |
| ------------------- | ----------------------------------------------------------------- |
| `/review` (sidebar) | The hub: tabs **Review later · Notes · Highlights · Bookmarks**.  |
| `/review?tab=note`  | Opens on a tab (`review-later`, `note`, `highlight`, `bookmark`). |

Each item shows its course, week and lecture, the kind of source (Study Guide, Lecture, MCQ,
Question Bank), where in it (section heading, page, question number), the file, the date, the
passage or question, and your note. A **Course** filter narrows every tab to one course. Newest
items come first.

## Marking

| Where                                   | What you can mark                                                   |
| --------------------------------------- | ------------------------------------------------------------------- |
| Study Guide reader (Phase 7)            | Highlight, note, bookmark, Review Later on text or a whole section. |
| Lecture viewer (Phase 8)                | Bookmark, note, Review Later on a page.                             |
| MCQ, Learn mode, after **Check answer** | **Review later** on the question.                                   |
| MCQ results, under each question        | **Review later** on the question.                                   |
| Question Bank, after **Reveal answer**  | **Review later** on the question.                                   |

The question toggle is a pressed/unpressed button; pressing it again removes the mark. It never
changes a score, a rating or lecture completion.

## Opening and removing

- **Open** goes to the exact place:
  - a Study Guide item opens the guide at `?annotation=<id>`; the passage is scrolled into view,
    focused and briefly flashed, and the parameter is removed from the address so a reload does
    not jump again;
  - a lecture page opens the viewer at `?page=N`;
  - a Question Bank question opens the bank at `?item=qN`, which puts that question first;
  - an MCQ shows **Practise** instead: it starts a Learn session of that one question, so the
    answer and explanation follow straight away. It is an ordinary session and its attempt counts
    like any other.
- **Done** (Review later) and **Remove** (notes, highlights, bookmarks) delete the item. Removing a
  note asks first, since its text cannot be recovered. Notes are edited where they were made (the
  reader's or viewer's panel), which **Open** leads to.

## Items whose source is gone

Nothing is moved silently. After a re-import:

- a Study Guide item is re-found by its quote and context (Phase 7 anchoring); if its text is gone
  it is listed with "This is no longer in the current version of the file" and **Open** disabled;
- a lecture page beyond the new page count is listed the same way;
- a question is found by key, or by fingerprint if the file renumbered it (so the mark follows the
  question, not the number); a question that is gone is listed the same way.

An orphan can always be removed.

## Data

Review Later on questions is stored in `question_review_items` (migration `0010`): user, quiz or
bank (`resource_id`), the question's key and fingerprint, an optional note, timestamps. One item
per question (unique on resource and key); the composite foreign key to `resources` means it can
only point at the user's own resource. Study Guide and lecture items stay in their Phase 7 and
Phase 8 tables; nothing was migrated.

The hub (`scope.review.hub()`) is read-only: it reads the three tables, joins course, week and
lecture, and resolves each item against the current parsed content. It returns no storage keys,
paths or hashes. Another user's item behaves exactly like one that does not exist.

## Tests

- `packages/database/src/access/review.test.ts`: adding, notes, removing, privacy, the foreign
  key, the hub's context and order, renumbered questions, orphans, completion untouched.
- `apps/web/src/features/review/logic.test.ts`: the actions with untrusted input, other users,
  one-question practice, the links.
- `apps/web/e2e/review.spec.ts`: marking an MCQ and a Question Bank question, opening each kind
  of item at its place, Done/Remove, the course filter, accessibility in both themes, mobile,
  another user, signed out.

## Not in Phase 12

Weak concepts, overdue review and due flashcards on the Review page come with the study engine
and planner (Phases 15–16). Export of annotations is Phase 20.
