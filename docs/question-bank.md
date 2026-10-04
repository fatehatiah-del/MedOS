# Question Bank: active recall

Phase 10 turns imported question banks into active-recall practice, separate from MCQ.
`CLAUDE.md` §13 and `BUILD_PLAN.md` Phase 10 are the specification; this file describes what was
built.

## Where it is

| Address                                                         | Shows                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------- |
| `/question-bank` (sidebar)                                      | Your banks by course, week and lecture, with progress.  |
| `/courses/<course>/lectures/<lecture>/question-bank/<resource>` | Practising one bank, and your record for each question. |

The lecture page shows **Practise recall** beside each readable bank, with "n of N practised".
That is information only: it never completes the lecture.

## Practising

1. **The question.** Any answer choices the item has are hidden at first, so you recall rather than
   recognise; **Show options** shows them.
2. **Your answer, optional.** Think it through, or type it. Typing is never required.
3. **Reveal answer** (Enter, or Ctrl+Enter from the answer box). The source's model answer appears,
   with the correct option highlighted when the item has choices and the source's notes on wrong
   choices, next to what you typed.
4. **Rate your recall**: Again, Hard, Good or Easy (keys 1–4). The next question follows; at the end
   a summary shows your ratings.

An item whose source gives no paired answer says so; nothing is invented. Typed answers are your
own and are never graded automatically (there is no AI).

**Order.** Questions you have not practised come first (in source order), then those you last
rated Again, then Hard, then the rest, the longest ago first. It is deterministic and explained on
the page. Spaced scheduling (FSRS) comes with flashcards in Phase 11.

**Your record.** For each question practised: how many times, the latest rating, and every attempt
with its date, rating and what you typed.

## The answer stays on the server

An item is sent to the browser without its answer. The model answer is only returned by revealing,
which first records the attempt. Viewing the page source before revealing shows nothing of it.

## Data

| Table                    | One row is                                                |
| ------------------------ | --------------------------------------------------------- |
| `question_bank_attempts` | One reveal of one item: what was typed, the rating, time. |

An attempt records the user, the bank (and through it the lecture, week and course), the item's
key and fingerprint, what you typed (if anything), when you revealed it, your rating and when, the
time spent, and the attempt number (your n-th attempt at that item). Every reveal is its own
record; ratings can be changed. Items are not copied, so attempts stay attached to the source
after a re-import. The table is owned like every study-data table (`user_id`, composite foreign
keys, `ON DELETE RESTRICT`). Practising never changes lecture completion.

## The Pharmacology Week 1 bank

`Pharmacodynamics_W1_QuestionBank.docx` is titled "Pharmacodynamics I — Practice Quiz" and holds
40 numbered four-option questions with an "Answers & explanations" section: the same 40 questions
as the week's MCQ quiz. MedOS reads it correctly as 40 items. An expected count of 21 does not
match this file; a different bank may have been intended. Nothing was changed.

## Tests

- **Database** (`packages/database/src/access/question-bank.test.ts`): reveal records an attempt
  first, with or without typing; ratings persist and can change; history and attempt numbers;
  banks with their lecture and progress; privacy; constraints; completion unchanged.
- **Web** (`apps/web/src/features/question-bank/*.test.ts`): no answer in what the browser receives
  before revealing, the practice order, and the Server Function logic.
- **End to end** (`apps/web/e2e/question-bank.spec.ts`, desktop and mobile): a synthetic bank
  imported through MedOS Sync. The sidebar page, opening from the lecture page, revealing without
  typing, typed answers and ratings surviving a reload, hidden options, a finished session,
  completion unchanged, overflow, accessibility in both themes, privacy.

## Not in Phase 10

- FSRS scheduling and flashcards (Phase 11).
- Statistics and weakness analysis (Phase 16).
- Automatic grading of typed answers, AI.
