# Calendar and academic schedule

Phase 14 puts university life on the calendar: the timetable, the academic calendar, course exams
and the user's own events (specification §21–24, BUILD_PLAN Phase 14).

## Sources

The university material lives in the study folder under `S5/Calendars` and is **transcribed** into
typed data in `@medos/shared`, where it can be reviewed and tested. MedOS Sync skips that folder.

| Data                      | Source                                                       | Code                                       |
| ------------------------- | ------------------------------------------------------------ | ------------------------------------------ |
| Weekly timetable          | `F2026 - Year 3.pdf` (EUC Medical School, Year 3, Fall 2026) | `packages/shared/src/timetable.ts`         |
| Academic calendar         | `current_frankfurt_medicine.pdf` (Years 1–3, Fall 2026 page) | `packages/shared/src/academic-calendar.ts` |
| Midterm period, 12–18 Nov | The user (not printed on the academic calendar)              | `FALL_2026.midterms` in `semester.ts`      |

### Timetable

- **Shared lectures** (all in Sigma) are for everyone.
- **Labs** rotate: groups EC A to EC F move between rooms in consecutive slots. Every group is
  transcribed, exactly as the grid shows it; only the user's group (`FALL_2026.group`, "A") is put
  on their calendar, one event per slot with its own room.
- The grid's "Independent Study" rows are not university sessions and are left out.

### When the timetable is taught

Weekdays from the first day of instruction (28 Sep 2026) to the last day before the winter holidays
(18 Dec), and from the first day after them (7 Jan 2027) to the last day of instruction (15 Jan).
No teaching on the public holidays (1 and 28 Oct) or in the midterm period (12–18 Nov). That is 60
teaching days and 217 sessions for Group A.

### Academic dates

All-day events: first and last days of instruction, public holidays, add/drop (9 Oct), withdrawal
(4 Dec), the student feedback survey (14 Dec – 15 Jan), winter holidays (21 Dec – 6 Jan), the
midterm period, the final examination period (18–29 Jan) and the end of the semester (29 Jan).

## Import

`importUniversityCalendar` (`packages/database/src/seed/calendar.ts`) writes these as
`calendar_events` with `origin = university`:

- each event has a stable `source_key` (`2026-fall:lab-pathology-5-14:45@2026-10-02`), unique per
  user, so importing again updates instead of duplicating, and leaves unchanged rows untouched;
- the user's notes on an imported event are never overwritten;
- an imported event no longer in the data (a corrected transcription) is removed; events the user
  created are never touched;
- times are campus wall-clock times (Europe/Berlin) turned into instants, correct across the change
  to winter time on 25 Oct; all-day events end at midnight after their last day.

It runs from `ensureWorkspace`. `semesters.calendar_version` stores a fingerprint of the data last
imported, so opening the workspace costs nothing extra until the data changes, and then the
calendar is imported again automatically.

To correct the timetable: edit the data file, run the tests, and the next workspace load imports
the change.

## Views

`/calendar?view=…&date=…`, so every view can be bookmarked and the browser's back button works.

| View     | Shows                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Day      | One day hour by hour (08:00–21:00, widened for anything earlier or later).                                                                  |
| Week     | Monday to Sunday side by side; scrolls sideways inside its frame on narrow screens.                                                         |
| Month    | Whole weeks around the month; each day's all-day items and first events, then "n more".                                                     |
| Semester | The term week by week, numbered as the academic calendar numbers teaching weeks, with each week's lectures, labs, academic dates and exams. |

All-day items (holidays, academic dates, the midterm and final periods) sit above the hours. Events
that overlap share the column side by side. All times are campus time (Europe/Berlin), whatever the
browser's own time zone.

**Telling events apart** (never by colour alone; each event's accessible name says what it is):

- university timetable: filled with the course colour;
- your own events: outlined and dashed, named "your event";
- course exams: red edge;
- timed study (Phase 13): dotted, labelled "Studied".

## Editing

- **Your own events** (study session, revision, assignment, personal): **New event**; open one to
  edit or delete it. Timed (start and end on one day) or all day (one or more days).
- **Course exams**: **Add exam** (course, final/midterm/other, date, time, place). Exams are entered
  by hand once announced; MedOS never infers exam scope. Listed under **Course exams**.
- **University timetable events** cannot be changed or deleted; you can keep **notes** on them,
  and the notes survive re-imports.

Server Functions (`features/calendar/actions.ts`) validate the input with Zod and turn campus dates
and times into instants; the data layer (`access/calendar.ts`) enforces ownership and read-only
imported events.

## Today

Today now shows the real campus date and the day's real lectures, labs and course exams from the
calendar. The recommended study plan remains a labelled sample until the study planner (Phase 15).
