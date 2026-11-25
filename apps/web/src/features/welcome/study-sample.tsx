"use client";

import { Button } from "@medos/ui";
import { useState } from "react";

const OPTIONS = ["Ferritin", "Serum sodium", "Platelet count"];

export function StudySample() {
  const [answer, setAnswer] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="grid overflow-hidden rounded-2xl border border-border bg-canvas md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <div className="border-b border-border bg-surface p-5 sm:p-8 md:border-r md:border-b-0">
        <fieldset className="min-w-0">
          <legend className="float-left mb-4 w-full font-display text-xl font-semibold">
            Practice question
          </legend>
          <p className="clear-both mb-4 text-fg-muted">
            Which of these tests best reflects stored iron?
          </p>
          <div className="grid gap-2">
            {OPTIONS.map((option) => (
              <Button
                key={option}
                type="button"
                className="min-h-11 w-full justify-start px-4"
                variant={answer === option ? "primary" : "secondary"}
                aria-pressed={answer === option}
                onClick={() => setAnswer(option)}
              >
                {option}
              </Button>
            ))}
          </div>
          <p role="status" className="mt-4 min-h-12 text-sm text-fg-muted">
            {answer === "Ferritin"
              ? "Correct. Ferritin reflects stored iron."
              : answer
                ? "Try again. Look for the protein that stores iron."
                : ""}
          </p>
        </fieldset>
      </div>
      <div className="bg-accent-soft p-5 sm:p-8">
        <h3 className="mb-4 font-display text-xl font-semibold">Flashcard</h3>
        <p className="mb-6 max-w-[15ch] font-display text-3xl leading-tight font-semibold text-fg">
          What does MCV measure?
        </p>
        <Button
          type="button"
          className="min-h-11"
          variant="secondary"
          aria-expanded={revealed}
          aria-controls="sample-flashcard-answer"
          onClick={() => setRevealed(!revealed)}
        >
          {revealed ? "Hide answer" : "Reveal answer"}
        </Button>
        <p id="sample-flashcard-answer" hidden={!revealed} className="mt-4 text-sm text-fg-muted">
          Mean corpuscular volume measures the average size of a red blood cell.
        </p>
      </div>
    </div>
  );
}
