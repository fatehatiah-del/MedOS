# Study timer

The study timer records **active** study time against a course, a lecture and an activity
(specification §25, BUILD_PLAN Phase 13). It never marks a lecture complete.

## Using it

- **Start** from where you study: the lecture page (choose the activity), the Study Guide reader's
  panel, the original lecture viewer, an MCQ session, a Question Bank and flashcard review. The
  course, lecture and activity are filled in. Nothing starts by itself.
- Study that belongs to no lecture (Revision, Other study) starts from the timer button in the top
  bar.
- The **top bar** shows the open timer on every page: its time, a pause/resume button, and a menu
  with **Finish and save**, **Discard** and a link back to the lecture.
- Where the open timer is for the page you are on, the page shows its time and controls instead of
  a start button.
- Finished sessions are listed under **Study time** on the lecture page, with the total by
  activity. A session can be **deleted** there (for a timer left running by mistake); sessions are
  not edited.
- Today's progress shows the active time studied since midnight (semester time zone).

## What counts

| Situation                                       | What happens                                                                                                                            |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Paused                                          | Nothing is counted until you resume.                                                                                                    |
| No input (keys, pointer, scroll) for 5 min      | The timer pauses itself, **backdated to your last input**, and says why.                                                                |
| Tab in the background for more than 2 min       | The timer pauses itself, backdated to when the tab was hidden (or your last input, if earlier).                                         |
| Moving between pages                            | Nothing changes: the timer lives in the app shell.                                                                                      |
| Reloading or closing the tab while running      | The browser asks first. The session is kept on the server either way.                                                                   |
| Browser gone for more than 7 min (no heartbeat) | The timer is **interrupted**: counted only up to the last moment you were seen. MedOS asks: Resume timing, Finish and save, or Discard. |
| Starting a second timer                         | Refused: one timer at a time. MedOS offers to finish the current one and start the new one.                                             |

## How it works

The server keeps the time; the browser only reports what you do.

- `study_sessions.active_seconds` holds the time of every closed stretch; `running_since` marks the
  start of the current one and is empty while paused or finished.
- `last_active_at` moves on start, resume and a **heartbeat** (every 60 s while the tab is visible
  and you are active). A running stretch is never counted past it once it is more than 7 minutes
  old, and a heartbeat cannot revive an interrupted timer: you decide.
- An automatic pause sends how long you have been idle, not a time; the server subtracts it from
  its own clock, so a wrong browser clock cannot add or remove time.
- One open session per user is enforced by the database
  (`study_sessions_one_open_idx`, partial unique on `user_id where ended_at is null`).
- The timing policy is `STUDY_TIMER` in `@medos/shared`, used by both sides.

Code: `packages/database/src/access/study-sessions.ts` (the rules) and `apps/web/src/features/timer/`
(actions, browser clock, provider, top-bar timer, start button, recovery prompt, lecture summary).

## Not yet

- Statistics charts and semester totals (Phase 16), study sessions on the calendar (Phase 14).
