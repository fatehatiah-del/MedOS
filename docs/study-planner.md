# Study planner

The planner proposes a plan for each day from the user's own study signals, and then hands it over:
the plan is the user's to reorder, resize, add to, postpone or ignore (specification §19–20,
BUILD_PLAN Phase 15). It is a fixed, readable formula, not AI. The same signals always give the
same plan.

## Signals

| Signal              | Source                                                                 |
| ------------------- | ---------------------------------------------------------------------- |
| Lecture today       | Lectures on today's timetable (the calendar).                          |
| Unfinished lectures | Lectures given (their week has begun) and not marked complete.         |
| Flashcards due      | The same queue the course's review screen uses.                        |
| Weak MCQ topics     | Under 70% correct over at least 3 scored answers, per topic.           |
| Weak recall         | Question Bank items whose latest rating is Again or Hard.              |
| Review Later        | Items marked Review Later in Study Guides, lecture PDFs and questions. |
| Exam urgency        | Course exams you entered, and the midterm and final periods.           |
| Recent study        | Active timed study per course over the last seven days.                |
| Available time      | Your study time: 2h 30m on weekdays and 4h at weekends unless changed. |

## The formula

Each candidate block's score is a plain sum of named parts; each part is shown as a reason.

| Part                                   | Points                                      |
| -------------------------------------- | ------------------------------------------- |
| Lecture today                          | 35                                          |
| Not marked complete                    | 15                                          |
| Given in the last two weeks            | 10                                          |
| Flashcards due                         | 10 + ½ per card (up to 60 cards)            |
| Weak MCQ topic                         | 20 + half the points below 70%              |
| Weak recall                            | 15 + 2 per question (up to 10)              |
| Review Later                           | 8 + 1 per item (up to 10)                   |
| Exam within 28 days (course or period) | up to 40, rising linearly as the exam nears |
| Little study in this course this week  | 5 (under 30 minutes in seven days)          |

Candidates: for each course, its lecture (the one just taught on a lecture day, otherwise the
earliest unfinished), its flashcards, its weakest MCQ topic, its Question Bank with most weak items,
and its Review Later items. Highest score first; ties are broken by a fixed key.

**Fitting:** blocks are taken in order while they fit the time left. A block that does not fit is
shortened to what is left (and says so), if that is at least 10 minutes. The plan never exceeds the
available time, and holds at most 8 blocks.

The weights live in one place, `PLANNER_WEIGHTS` in `packages/study-engine/src/planner.ts`.

## Your plan is yours

- A day is suggested **once**, the first time it is opened. It is never rebuilt on its own.
- **Refresh suggestions** replaces only suggestions you have not touched. Anything you resized,
  renamed, moved, ticked off or added yourself stays.
- **Removing** a suggestion sets it aside for the day, so it is not proposed again; removing your
  own item deletes it. **Clear suggestions** sets every remaining suggestion aside.
- **Postponing** moves an item to the end of the next day's plan; that day's suggestions fit around
  it.
- Ticking an item done never marks a lecture complete; only you do that, on the lecture page.

## Using it

`/study-plan?date=…` shows one day. Today and later days are suggested the first time they are
opened; past days are shown as they were planned and cannot be changed.

- **Reorder:** drag an item by its handle, or from the keyboard: focus the handle, press Space,
  move with the arrow keys, press Space to drop (Escape cancels). Screen readers hear each move.
- **Duration:** the minutes menu on each item. **Done:** the checkbox.
- **Start:** starts the study timer with the item's course, lecture and activity.
- **Postpone** (arrow) and **Remove** (bin); **Add item**, **Refresh suggestions**, **Clear
  suggestions** above the list.
- **Why?** lists the item's reasons and its priority, the sum of them.
- **Available study time:** weekdays and weekends, in hours, beside the plan.

Today shows the same plan, read-only, with a link to the Study Plan. Every change is saved at once;
the list updates straight away and goes back, with a message, if a save fails.

Code: `packages/study-engine` (the pure planner) and `packages/database/src/access/planner.ts`
(signals, storage and edits). Tables: `user_settings`, `daily_plans`, `daily_plan_items`.
