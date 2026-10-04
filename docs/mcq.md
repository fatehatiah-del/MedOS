# The MCQ engine

Phase 9 turns imported quizzes into question practice. `CLAUDE.md` §11–12 and `BUILD_PLAN.md`
Phase 9 are the specification; this file describes what was built.

## Where it is

| Address                                               | Shows                                                  |
| ----------------------------------------------------- | ------------------------------------------------------ |
| `/courses/<course>/lectures/<lecture>/mcq/<resource>` | Choosing a mode, and your sessions on this quiz.       |
| `…/mcq/<resource>/session/<session>`                  | A session in progress, or its results once it is over. |

The lecture page shows **Practise MCQ** beside each readable quiz, with the score of your latest
exam ("Last exam 85%"). That score is information only: it never completes the lecture.

Questions come only from the imported quiz. MedOS generates no questions and adds no
explanations (there is no AI provider).

## Modes

| Mode  | Feedback              | Questions                                                                                                     | Timer                        |
| ----- | --------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Learn | After each answer     | The chosen ones, in source order                                                                              | None                         |
| Exam  | Only after submission | The chosen ones; optionally shuffled                                                                          | 90 s per question by default |
| USMLE | Only after submission | Only questions the source types as vignette, clinical, mechanism, consequence or application; vignettes first | As Exam                      |

Before starting you can choose one topic and a smaller number of questions (10 or 20). For exams
the time limit can be the default, untimed, or a number of minutes. Options always keep the
source's order and letters, because explanations refer to them.

**Learn.** After you check an answer: correct or incorrect, the correct answer, the source's
explanation, why the other options are wrong where the source says, the source's reference
("Source: S17") and any image the source shows after answering. Answers are kept as you go; you
can leave and resume, and **Finish session** shows your results.

**Exam and USMLE.** A question navigator (answered, unanswered, flagged), flags, previous and next,
and a timer. Nothing about correctness is sent to the browser until you submit; answers, flags and
time per question are saved as you work, so a reload loses nothing. Saves are sent one at a time,
in order, and "Saved" means all of them are stored. When the time runs out the exam is submitted.
Unanswered questions count as not correct.

**Results.** Score and percentage, performance by topic and by question type, the incorrect,
flagged and unanswered questions (each a link to its review), time spent, and a review of every
question with your answer, the correct answer and the source's explanations.

Keyboard: A–D or 1–4 to choose, Enter to check and continue (Learn), F to flag and ← → to move
(Exam).

## Answers stay on the server

- A question is sent to the browser without its answer, explanations or after-answer image.
- In Learn mode the server marks each answer and only then sends the feedback.
- In Exam and USMLE modes nothing is marked or sent until submission. Viewing the page source
  reveals nothing.
- A question whose source states no answer is recorded but not scored, and says so.

## Data

| Table          | One row is                                                                     |
| -------------- | ------------------------------------------------------------------------------ |
| `mcq_sessions` | A practice session: mode, questions in order, time limit, in-progress answers. |
| `mcq_attempts` | One answer to one question in one session.                                     |

An attempt records the user, the session and quiz, the mode, the question's key and fingerprint,
the option chosen (none when an exam question was left unanswered), whether it was correct, the
time spent, the attempt number (your n-th attempt at that question, across sessions), whether it
was flagged, and when.

- **Repeat attempts are separate records.** A question is answered once per session; practising
  again is a new session with new attempts.
- **Questions are not copied.** Sessions refer to the imported questions by key and fingerprint,
  so attempts stay attached to the source and can be recognised after a re-import.
- **The time limit is enforced on the server**, with 30 seconds' grace for network delay. Time per
  question is capped at an hour.
- Exam answers in progress are updated one question at a time in a single statement, so saves
  arriving together never overwrite each other.
- An unfinished exam can be **discarded**; it is kept but never counts in results.
- Both tables are owned like every study-data table (`user_id`, composite foreign keys, `ON
DELETE RESTRICT`). Another user's quiz or session behaves exactly like one that does not exist.

Practising never changes lecture completion. A session page offers the study timer (activity
MCQ); see [`study-timer.md`](study-timer.md).

## Tests

- **Database** (`packages/database/src/access/mcq.test.ts`): server-side marking, one answer per
  question per session, attempt numbering, exam drafts and submission, concurrent saves, the time
  limit, discarding, privacy, completion unchanged.
- **Web** (`apps/web/src/features/mcq/*.test.ts`): nothing about answers in what the browser
  receives, feedback, USMLE selection and ordering, topics, counts, shuffling, time limits,
  results and breakdowns, and the Server Function logic.
- **End to end** (`apps/web/e2e/mcq.spec.ts`, desktop and mobile): a synthetic six-question quiz
  imported through MedOS Sync. Learn feedback and resuming, Exam with nothing shown before
  submission, navigator and flags surviving a reload, results, USMLE filtering, submission when
  time runs out, discarding, completion unchanged, overflow, accessibility in both themes, privacy.

## Not in Phase 9

- Question Bank practice (Phase 10), flashcards (Phase 11).
- Statistics pages and weakness analysis across quizzes (Phase 16).
- Linking "Source: S17" to the lecture viewer (prepared in Phase 8, not active).
- AI explanations or generated questions.
