import { cn } from "@medos/ui";
import { Check, CircleHelp, X } from "lucide-react";
import type { ReactNode } from "react";

import { InlineContent, mediaSrc } from "@/features/study-guide/content";
import { FigureImage } from "@/features/study-guide/figure-image";

import type { ClientQuestion, Feedback } from "./views";

/*
 * Presentation of a question, its options and its feedback, shared by the
 * Learn and Exam runners and the results review. Text is the imported
 * source's, rendered exactly as parsed; options keep the source's order and
 * letters.
 */

export function QuestionStem({
  question,
  resourceId,
  position,
}: {
  question: ClientQuestion;
  resourceId: string;
  /** "Question 3 of 20". */
  position: string;
}) {
  return (
    <div className="space-y-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] font-medium text-fg-subtle">
        <span>{position}</span>
        {question.topic ? (
          <>
            <span aria-hidden="true">·</span>
            <span>{question.topic}</span>
          </>
        ) : null}
        {question.questionType ? (
          <>
            <span aria-hidden="true">·</span>
            <span className="capitalize">{question.questionType}</span>
          </>
        ) : null}
      </p>
      <p className="text-[16px] leading-[1.65] text-fg">
        <InlineContent inlines={question.stem} />
      </p>
      {question.image ? (
        <div className="max-w-xl">
          <FigureImage
            src={mediaSrc(resourceId, question.image)}
            alt={question.image.altText ?? `Image for question ${question.number}`}
            caption={`Question ${question.number}`}
          />
        </div>
      ) : null}
    </div>
  );
}

/** How an option looks once feedback is known. */
export type OptionMark = "correct" | "chosen-wrong" | "chosen" | "none";

export function optionMark(
  index: number,
  selected: number | null,
  feedback: Feedback | null,
): OptionMark {
  if (!feedback) return selected === index ? "chosen" : "none";
  if (feedback.correctIndex === index) return "correct";
  if (selected === index) return "chosen-wrong";
  return "none";
}

export function OptionLabel({
  label,
  text,
  mark,
  suffix,
}: {
  label: string;
  text: ClientQuestion["options"][number]["text"];
  mark: OptionMark;
  suffix?: ReactNode;
}) {
  return (
    <span className="flex min-w-0 flex-1 items-start gap-3">
      <span
        aria-hidden="true"
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full border text-[13px] font-semibold",
          mark === "correct" && "border-success bg-success text-white",
          mark === "chosen-wrong" && "border-danger bg-danger text-white",
          mark === "chosen" && "border-accent bg-accent text-accent-fg",
          mark === "none" && "border-border-strong text-fg-muted",
        )}
      >
        {label}
      </span>
      <span className="min-w-0 pt-0.5 text-[15px] leading-relaxed text-fg">
        <span className="sr-only">{label}. </span>
        <InlineContent inlines={text} />
        {suffix}
      </span>
    </span>
  );
}

const MARK_WORDS: Record<OptionMark, string | null> = {
  correct: "Correct answer",
  "chosen-wrong": "Your answer",
  chosen: null,
  none: null,
};

export function MarkWord({ mark, selected }: { mark: OptionMark; selected: boolean }) {
  const word = mark === "correct" && selected ? "Your answer, correct" : MARK_WORDS[mark];
  return word ? (
    <span
      className={cn(
        "ml-2 rounded px-1.5 py-0.5 text-[11.5px] font-semibold whitespace-nowrap",
        mark === "correct" ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
      )}
    >
      {word}
    </span>
  ) : null;
}

/** Feedback after answering: the verdict, the correct answer and the source's explanations. */
export function FeedbackPanel({
  question,
  feedback,
  selected,
  resourceId,
}: {
  question: ClientQuestion;
  feedback: Feedback;
  selected: number | null;
  resourceId: string;
}) {
  const correctLabel =
    feedback.correctIndex !== null ? question.options[feedback.correctIndex]?.label : null;
  const verdict =
    feedback.correctIndex === null
      ? {
          tone: "neutral",
          icon: CircleHelp,
          text: "The source states no answer for this question.",
        }
      : selected === null
        ? { tone: "danger", icon: X, text: `Not answered. The answer is ${correctLabel}.` }
        : feedback.correct
          ? { tone: "success", icon: Check, text: `Correct: ${correctLabel}.` }
          : { tone: "danger", icon: X, text: `Incorrect. The answer is ${correctLabel}.` };
  const Icon = verdict.icon;
  const wrongNotes = question.options
    .map((option, index) => ({ option, index, note: feedback.optionExplanations[index] }))
    .filter((entry) => entry.note && entry.index !== feedback.correctIndex);

  return (
    <div className="space-y-4">
      <p
        className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-2 text-[14.5px] font-semibold",
          verdict.tone === "success" && "bg-success-soft text-success",
          verdict.tone === "danger" && "bg-danger-soft text-danger",
          verdict.tone === "neutral" && "bg-subtle text-fg-muted",
        )}
      >
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        {verdict.text}
      </p>
      {feedback.explanation ? (
        <div className="space-y-1">
          <h3 className="text-[12px] font-semibold tracking-wide text-fg-subtle uppercase">
            Explanation
          </h3>
          <p className="text-[15px] leading-relaxed text-fg">
            <InlineContent inlines={feedback.explanation} />
          </p>
        </div>
      ) : null}
      {wrongNotes.length > 0 ? (
        <div className="space-y-1.5">
          <h3 className="text-[12px] font-semibold tracking-wide text-fg-subtle uppercase">
            Why the other options are wrong
          </h3>
          <ul className="space-y-1.5">
            {wrongNotes.map(({ option, index, note }) => (
              <li key={index} className="flex gap-2 text-[14.5px] leading-relaxed text-fg">
                <span className="shrink-0 font-semibold text-fg-muted">{option.label}</span>
                <span>
                  <InlineContent inlines={note ?? []} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {feedback.revealImage ? (
        <div className="max-w-xl">
          <FigureImage
            src={mediaSrc(resourceId, feedback.revealImage)}
            alt={feedback.revealImage.altText ?? `Answer image for question ${question.number}`}
            caption={`Question ${question.number}, answer`}
          />
        </div>
      ) : null}
      {feedback.sourceRef ? (
        <p className="text-[12.5px] text-fg-subtle">Source: {feedback.sourceRef}</p>
      ) : null}
    </div>
  );
}
