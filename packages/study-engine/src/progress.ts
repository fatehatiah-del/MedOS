import {
  type IsoDate,
  type StudyAvailability,
  addDays,
  availableMinutesFor,
  daysBetween,
} from "@medos/shared";

/*
 * Restrained progress measures (specification §29): a study streak and a
 * weekly target, from real study days and the user's own study time. Plain
 * counts, no points, levels or badges.
 */

export interface Streak {
  /** Consecutive study days ending today, or yesterday when today has no study yet. */
  current: number;
  /** The longest run of consecutive study days. */
  best: number;
  studiedToday: boolean;
}

/**
 * The streak of a set of study days. A day counts once it has study in it;
 * not having studied yet today does not break the streak (the day is not
 * over). A gap of one day or more ends a run.
 */
export function streakOf(days: Iterable<IsoDate>, today: IsoDate): Streak {
  const studied = new Set([...days].filter((day) => daysBetween(day, today) >= 0));
  const studiedToday = studied.has(today);
  let current = 0;
  for (
    let day = studiedToday ? today : addDays(today, -1);
    studied.has(day);
    day = addDays(day, -1)
  ) {
    current += 1;
  }
  const sorted = [...studied].sort();
  let best = 0;
  let run = 0;
  for (const [index, day] of sorted.entries()) {
    run = index > 0 && daysBetween(sorted[index - 1]!, day) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return { current, best, studiedToday };
}

/** Monday of the week `date` falls in. */
export function weekStart(date: IsoDate): IsoDate {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

export interface WeeklyTarget {
  start: IsoDate;
  end: IsoDate;
  /** The week's study time from the user's own availability: Monday to Sunday. */
  targetMinutes: number;
  studiedMinutes: number;
  /** Whole percent of the target studied, capped at 100; null without a target. */
  percent: number | null;
  /** Days of the week with study. */
  daysStudied: number;
}

/**
 * The week's target is the study time the user set for each day of it, added
 * up (weekdays and weekend days as configured), so it follows their own
 * settings rather than a number MedOS chooses.
 */
export function weeklyTarget(
  today: IsoDate,
  availability: StudyAvailability,
  minutesByDay: ReadonlyMap<IsoDate, number>,
): WeeklyTarget {
  const start = weekStart(today);
  let targetMinutes = 0;
  let studiedMinutes = 0;
  let daysStudied = 0;
  for (let index = 0; index < 7; index += 1) {
    const day = addDays(start, index);
    targetMinutes += availableMinutesFor(day, availability);
    const minutes = minutesByDay.get(day) ?? 0;
    studiedMinutes += minutes;
    if (minutes > 0) daysStudied += 1;
  }
  return {
    start,
    end: addDays(start, 6),
    targetMinutes,
    studiedMinutes,
    percent:
      targetMinutes > 0 ? Math.min(100, Math.round((studiedMinutes / targetMinutes) * 100)) : null,
    daysStudied,
  };
}

/**
 * A flashcard counts as mastered when the scheduler has put its next review
 * at least this many days after its last: a stated threshold on FSRS's own
 * interval, not a score.
 */
export const MASTERED_INTERVAL_DAYS = 21;
