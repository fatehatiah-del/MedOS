import { Surface, cn } from "@medos/ui";
import { Flag } from "lucide-react";

import { ReviewLaterToggle } from "@/features/review/review-later-toggle";

import { FeedbackPanel, MarkWord, OptionLabel, QuestionStem, optionMark } from "./question";
import type { Breakdown, Results } from "./views";

/*
 * The results of a session: the score, performance by topic and by question
 * type, the incorrect, flagged and unanswered questions, the time spent, and
 * a review of every question with the source's explanations.
 */

function duration(seconds: number | null): string {
  if (seconds === null) return "—";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes} min ${rest} s` : `${rest} s`;
}

function BreakdownTable({ caption, rows }: { caption: string; rows: Breakdown[] }) {
  if (rows.length === 0) return null;
  return (
    <div
      className="overflow-x-auto rounded-lg border border-border"
      role="region"
      aria-label={caption}
      tabIndex={0}
    >
      <table className="w-full border-collapse text-left text-[14px]">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-subtle text-[12.5px] text-fg-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">
              {caption
                .replace("Performance by ", "")
                .replace(/^./, (letter) => letter.toUpperCase())}
            </th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">
              Correct
            </th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">
              Score
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const percent = row.scored > 0 ? Math.round((row.correct / row.scored) * 100) : 0;
            return (
              <tr key={row.label} className="border-t border-border">
                <th scope="row" className="px-3 py-2 font-medium text-fg capitalize">
                  {row.label}
                </th>
                <td className="px-3 py-2 text-right text-fg-muted tabular-nums">
                  {row.correct} / {row.scored}
                </td>
                <td
                  className={cn(
                    "px-3 py-2 text-right font-semibold tabular-nums",
                    percent >= 70 ? "text-success" : percent >= 50 ? "text-warning" : "text-danger",
                  )}
                >
                  {percent}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function QuestionLinks({
  title,
  keys,
  results,
}: {
  title: string;
  keys: string[];
  results: Results;
}) {
  if (keys.length === 0) return null;
  const position = new Map(results.items.map((item, index) => [item.question.key, index + 1]));
  return (
    <div className="space-y-1.5">
      <h3 className="text-[13px] font-semibold text-fg">
        {title} ({keys.length})
      </h3>
      <ul className="flex flex-wrap gap-1.5">
        {keys.map((key) => (
          <li key={key}>
            <a
              href={`#review-${key}`}
              className="flex h-8 min-w-8 items-center justify-center rounded-md border border-border bg-surface px-2 text-[13px] font-medium text-fg tabular-nums hover:bg-subtle"
              aria-label={`Question ${position.get(key)}`}
            >
              {position.get(key)}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ResultsView({
  results,
  resourceId,
  modeLabel,
  reviewLater,
}: {
  results: Results;
  resourceId: string;
  modeLabel: string;
  /** Keys of the questions marked Review Later. */
  reviewLater: readonly string[];
}) {
  return (
    <div className="space-y-8">
      <section aria-labelledby="results-heading" className="space-y-5">
        <h2 id="results-heading" className="font-serif text-[1.35rem] font-semibold text-fg">
          {modeLabel} results
        </h2>
        <div className="grid gap-3 @xl:grid-cols-4">
          {[
            ["Score", `${results.correct} / ${results.scored}`],
            ["Percentage", `${results.percent}%`],
            ["Answered", `${results.answered} of ${results.total}`],
            ["Time", duration(results.elapsedSeconds)],
          ].map(([label, value]) => (
            <Surface key={label} padding="md" className="space-y-1">
              <p className="text-[12.5px] font-medium text-fg-subtle">{label}</p>
              <p className="text-[1.4rem] font-semibold text-fg tabular-nums">{value}</p>
            </Surface>
          ))}
        </div>
        {results.scored < results.total ? (
          <p className="text-[13px] text-fg-muted">
            {results.total - results.scored} question(s) have no answer stated in the source and are
            not scored.
          </p>
        ) : null}
        <div className="grid gap-4 @3xl:grid-cols-2">
          <BreakdownTable caption="Performance by topic" rows={results.byTopic} />
          <BreakdownTable caption="Performance by question type" rows={results.byType} />
        </div>
        <div className="grid gap-4 @3xl:grid-cols-3">
          <QuestionLinks title="Incorrect" keys={results.incorrect} results={results} />
          <QuestionLinks title="Flagged" keys={results.flagged} results={results} />
          <QuestionLinks title="Unanswered" keys={results.unanswered} results={results} />
        </div>
      </section>

      <section aria-labelledby="review-heading" className="space-y-4">
        <h2 id="review-heading" className="font-serif text-[1.2rem] font-semibold text-fg">
          Review
        </h2>
        <ol className="space-y-4">
          {results.items.map((item, index) => (
            <li
              key={item.question.key}
              id={`review-${item.question.key}`}
              className="scroll-mt-24 space-y-4 rounded-xl border border-border bg-surface p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <QuestionStem
                  question={item.question}
                  resourceId={resourceId}
                  position={`Question ${index + 1} of ${results.total}`}
                />
                {item.flagged ? (
                  <span className="flex shrink-0 items-center gap-1 text-[12px] font-semibold text-warning">
                    <Flag aria-hidden="true" className="size-3.5" /> Flagged
                  </span>
                ) : null}
              </div>
              <ul className="space-y-2">
                {item.question.options.map((option, optionIndex) => {
                  const mark = optionMark(optionIndex, item.selected, item.feedback);
                  return (
                    <li
                      key={option.label}
                      className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5"
                    >
                      <OptionLabel
                        label={option.label}
                        text={option.text}
                        mark={mark}
                        suffix={<MarkWord mark={mark} selected={item.selected === optionIndex} />}
                      />
                    </li>
                  );
                })}
              </ul>
              <FeedbackPanel
                question={item.question}
                feedback={item.feedback}
                selected={item.selected}
                resourceId={resourceId}
              />
              <ReviewLaterToggle
                resourceId={resourceId}
                questionKey={item.question.key}
                initiallyMarked={reviewLater.includes(item.question.key)}
              />
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
