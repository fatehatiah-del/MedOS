# Progress

Restrained progress measures (specification §29, BUILD_PLAN Phase 18): plain counts from what you
have actually done. No badges, points, levels, confetti or reward animations.

| Measure             | Where             | What it is                                                                                                                                            |
| ------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Study streak        | Today, Statistics | Consecutive days with at least a minute of timed study, ending today, or yesterday while today has no study yet. Statistics also shows your best run. |
| Weekly target       | Today, Statistics | Your own study time added up for Monday to Sunday (weekdays and weekend days as set on the Study Plan), against active study logged that week.        |
| Study hours         | Statistics        | Active timed study.                                                                                                                                   |
| Questions answered  | Statistics        | MCQ answers and Question Bank reveals, all time and this week.                                                                                        |
| Flashcards mastered | Statistics        | Cards the scheduler has put 21 days or more past their last review (FSRS's own interval).                                                             |
| Retention           | Statistics        | Reviews in the last 30 days not rated Again.                                                                                                          |
| Course completion   | Statistics        | Lectures you marked complete, per course.                                                                                                             |

The rules are pure, tested functions in `packages/study-engine/src/progress.ts` (`streakOf`,
`weeklyTarget`, `MASTERED_INTERVAL_DAYS`); `packages/database/src/access/progress.ts` feeds them
recorded sessions and activity. Statistics uses the same streak function, so the two never differ.
