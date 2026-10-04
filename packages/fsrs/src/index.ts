import {
  type Card,
  type Grade,
  Rating,
  State,
  createEmptyCard,
  fsrs,
  generatorParameters,
} from "ts-fsrs";

/*
 * MedOS spaced repetition. Flashcards are scheduled with FSRS (via the
 * open-source ts-fsrs implementation). Everything else in MedOS uses only the
 * types and functions here, so the algorithm can be replaced or tuned without
 * touching cards, reviews or screens.
 *
 * Scheduling is deterministic (no interval fuzz), so the same history always
 * gives the same next review, and it can be explained and tested.
 */

export const REVIEW_RATINGS = ["again", "hard", "good", "easy"] as const;
export type ReviewRating = (typeof REVIEW_RATINGS)[number];

export const CARD_STATES = ["new", "learning", "review", "relearning"] as const;
export type CardState = (typeof CARD_STATES)[number];

/** Desired retention: the chance of recalling a card when it falls due. */
export const DESIRED_RETENTION = 0.9;

/** Everything FSRS needs to know about a card, as MedOS stores it. */
export interface CardSchedule {
  due: Date;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: CardState;
  lastReview: Date | null;
}

const scheduler = fsrs(
  generatorParameters({ request_retention: DESIRED_RETENTION, enable_fuzz: false }),
);

const TO_STATE: Record<State, CardState> = {
  [State.New]: "new",
  [State.Learning]: "learning",
  [State.Review]: "review",
  [State.Relearning]: "relearning",
};
const FROM_STATE: Record<CardState, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};
const FROM_RATING: Record<ReviewRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

function fromCard(card: Card): CardSchedule {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: TO_STATE[card.state],
    lastReview: card.last_review ?? null,
  };
}

function toCard(schedule: CardSchedule, now: Date): Card {
  const elapsed = schedule.lastReview
    ? Math.max(0, Math.floor((now.getTime() - schedule.lastReview.getTime()) / 86_400_000))
    : 0;
  return {
    due: schedule.due,
    stability: schedule.stability,
    difficulty: schedule.difficulty,
    elapsed_days: elapsed,
    scheduled_days: schedule.scheduledDays,
    learning_steps: schedule.learningSteps,
    reps: schedule.reps,
    lapses: schedule.lapses,
    state: FROM_STATE[schedule.state],
    last_review: schedule.lastReview ?? undefined,
  };
}

/** The schedule of a card that has never been reviewed: due now. */
export function newSchedule(now: Date): CardSchedule {
  return fromCard(createEmptyCard(now));
}

/** The schedule after rating a card at `now`. */
export function review(schedule: CardSchedule, rating: ReviewRating, now: Date): CardSchedule {
  return fromCard(scheduler.next(toCard(schedule, now), now, FROM_RATING[rating]).card);
}

/** When the card would next be due for each rating, to show on the rating buttons. */
export function previewDue(schedule: CardSchedule, now: Date): Record<ReviewRating, Date> {
  const options = scheduler.repeat(toCard(schedule, now), now);
  return {
    again: options[Rating.Again].card.due,
    hard: options[Rating.Hard].card.due,
    good: options[Rating.Good].card.due,
    easy: options[Rating.Easy].card.due,
  };
}

/** The estimated chance of recalling the card now (0–1), or null for a card never reviewed. */
export function retrievability(schedule: CardSchedule, now: Date): number | null {
  if (schedule.state === "new" || !schedule.lastReview) return null;
  return scheduler.get_retrievability(toCard(schedule, now), now, false);
}

/** Whether a card is due at `now`. */
export const isDue = (schedule: Pick<CardSchedule, "due">, now: Date): boolean =>
  schedule.due.getTime() <= now.getTime();

/** "10 min", "3 d", "2 mo": how long until a date, for rating buttons. */
export function intervalLabel(from: Date, to: Date): string {
  const minutes = Math.max(1, Math.round((to.getTime() - from.getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days} d`;
  const months = Math.round(days / 30.4);
  if (months < 12) return `${months} mo`;
  return `${Math.round((days / 365) * 10) / 10} y`;
}
