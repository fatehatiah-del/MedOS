# Statistics and weak spots

Statistics (specification §27) and the weakness engine (§28), built only from what you have done in
MedOS (BUILD_PLAN Phase 16). Nothing is estimated, predicted or scored by AI, and there is no
"mastery" number anywhere.

## Levels

| Level    | Where                             | Shows                                                                                                            |
| -------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Semester | `/statistics`                     | Streak, days studied this week, the shared measures, study time by week, courses, upcoming workload, weak spots. |
| Course   | `/statistics?course=<slug>`       | The shared measures for the course, study time by week, weak spots, performance by topic, each lecture.          |
| Lecture  | the lecture page, **Performance** | The lecture's MCQ, Question Bank, flashcard and Review Later measures, its topics and weak spots.                |

**The shared measures:** lectures complete (marked by you), study time (active, from the timer), MCQ
accuracy and repeated errors, Question Bank latest ratings, flashcard retention (reviews not rated
Again in the last 30 days), flashcards reviewed and lapses, Review Later items.

**Empty data** reads "No data yet" (and "—" on screen), never 0%: a percentage only appears when
there is something to divide.

## Weak spots

A topic, lecture or concept is listed only when one of these rules is met, and it is shown with
every signal that met a rule:

| Signal           | Rule                                                                     |
| ---------------- | ------------------------------------------------------------------------ |
| MCQ accuracy     | A topic under 70% correct over at least 3 answers.                       |
| Repeated errors  | A question answered wrong more than once.                                |
| Flashcard lapses | A lecture with 3 or more lapses (lecture deck, or cards from its guide). |
| Weak recall      | A lecture with 2 or more Question Bank items last rated Again or Hard.   |
| Review Later     | A lecture with 2 or more Review Later items.                             |
| Marked difficult | A concept you marked yourself; joined to the MCQ topic of the same name. |

For example:

> **GPCR signalling** · Topic
> · MCQ accuracy: 58% (12 answers)
> · Repeated errors: 1 question answered wrong more than once
> · Marked difficult by you

Order: more independent signals first, then topics, lectures and concepts, alphabetically. Topics
come from the quizzes themselves; questions without a topic count at lecture level.

**Mark difficult / Unmark difficult** appears on topics and concepts; any concept can be added per
course on the course statistics. The rules live in `WEAKNESS_RULES`
(`packages/study-engine/src/weaknesses.ts`).

## Chart

One chart, where it adds something a table does not: study time per teaching week (semester and
course). One series in one colour (`--chart-1`, validated for lightness and contrast in light and
dark), thin bars, a quiet grid, a tooltip per week, and the same numbers as a table for screen
readers. With nothing recorded there is no chart, only a sentence.

Code: `packages/study-engine/src/weaknesses.ts` (rules), `packages/database/src/access/signals.ts`
(signals shared with the planner), `packages/database/src/access/statistics.ts` (measures),
`apps/web/src/features/statistics/`. Table: `difficult_concepts`.
