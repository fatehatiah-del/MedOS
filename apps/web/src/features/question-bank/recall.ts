import type { QuestionBankAttempt, RecallRating } from "@medos/database";
import type { Block, Inline, QuestionBankItem } from "@medos/parsers/model";

/*
 * Active recall on Question Bank items: what the browser may know before the
 * answer is revealed, what it learns on revealing, and the order items are
 * practised in. Pure, so it can be tested directly.
 */

/** An item as sent before its answer is revealed: the question and its choices only. */
export interface ClientItem {
  key: string;
  number: number | null;
  prompt: Block[];
  choices: { label: string; text: Inline[] }[];
}

/** What revealing an item shows: the source's model answer, or why there is none. */
export type RevealedAnswer =
  | {
      status: "paired";
      blocks: Block[];
      correctLabel: string | null;
      choiceNotes: { label: string; text: Inline[] }[];
    }
  | { status: "missing" | "ambiguous"; reason: string };

export function toClientItem(item: QuestionBankItem): ClientItem {
  return { key: item.key, number: item.number, prompt: item.prompt, choices: item.choices };
}

export function revealedAnswer(item: QuestionBankItem): RevealedAnswer {
  return item.answer;
}

export const RATINGS: { rating: RecallRating; label: string; hint: string }[] = [
  { rating: "again", label: "Again", hint: "I did not recall it" },
  { rating: "hard", label: "Hard", hint: "Recalled with real difficulty" },
  { rating: "good", label: "Good", hint: "Recalled with some effort" },
  { rating: "easy", label: "Easy", hint: "Recalled at once" },
];

/** Where each item stands: how often it was revealed and the latest rating given. */
export interface ItemStatus {
  attempts: number;
  lastRating: RecallRating | null;
  lastRevealedAt: Date | null;
}

export function itemStatuses(
  items: readonly QuestionBankItem[],
  attempts: readonly Pick<QuestionBankAttempt, "itemFingerprint" | "rating" | "revealedAt">[],
): Map<string, ItemStatus> {
  const statuses = new Map<string, ItemStatus>();
  for (const item of items) {
    const own = attempts
      .filter((attempt) => attempt.itemFingerprint === item.fingerprint)
      .sort((x, y) => x.revealedAt.getTime() - y.revealedAt.getTime());
    const rated = own.filter((attempt) => attempt.rating !== null);
    statuses.set(item.key, {
      attempts: own.length,
      lastRating: rated[rated.length - 1]?.rating ?? null,
      lastRevealedAt: own[own.length - 1]?.revealedAt ?? null,
    });
  }
  return statuses;
}

const RATING_PRIORITY: Record<RecallRating, number> = { again: 1, hard: 2, good: 3, easy: 3 };

/**
 * The order to practise in, and why: items never practised first (in source
 * order), then those last rated Again, then Hard, then everything else, the
 * longest ago first. Deterministic and explainable; spaced scheduling comes
 * with flashcards.
 */
export function practiceOrder(
  items: readonly QuestionBankItem[],
  statuses: ReadonlyMap<string, ItemStatus>,
): string[] {
  const rank = (item: QuestionBankItem) => {
    const status = statuses.get(item.key);
    if (!status || status.attempts === 0) return 0;
    return status.lastRating ? RATING_PRIORITY[status.lastRating] : 1;
  };
  return [...items]
    .map((item, index) => ({ item, index }))
    .sort((x, y) => {
      const byRank = rank(x.item) - rank(y.item);
      if (byRank !== 0) return byRank;
      const xTime = statuses.get(x.item.key)?.lastRevealedAt?.getTime() ?? 0;
      const yTime = statuses.get(y.item.key)?.lastRevealedAt?.getTime() ?? 0;
      return xTime - yTime || x.index - y.index;
    })
    .map(({ item }) => item.key);
}
