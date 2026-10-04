"use client";

import { AI_FEATURES, type AIFeature } from "@medos/ai";
import { Badge, cn } from "@medos/ui";
import { Sparkles } from "lucide-react";
import { useId, useState, useTransition } from "react";

import { type AIActionResult, requestAI } from "./actions";

/*
 * An AI feature, where it would be used. Without a configured provider it is
 * shown but unavailable: it stays focusable so its explanation can be read,
 * says "Not configured", and pressing it only explains why. With a provider,
 * the same control asks the server and shows the answer labelled as
 * AI-generated, apart from the source material.
 */
export function AIAction({
  feature,
  context = {},
  configured,
  className,
}: {
  feature: AIFeature;
  /** What the request is about: lecture, resource, question or deck ids. */
  context?: Record<string, string>;
  configured: boolean;
  className?: string;
}) {
  const id = useId();
  const { label, description } = AI_FEATURES[feature];
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<AIActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className={cn("space-y-2", className)}>
      <button
        type="button"
        aria-disabled={!configured || pending || undefined}
        aria-describedby={`${id}-state`}
        aria-expanded={configured ? undefined : open}
        aria-controls={configured ? undefined : `${id}-note`}
        onClick={() => {
          if (!configured) {
            setOpen(!open);
            return;
          }
          if (pending) return;
          startTransition(async () => setResult(await requestAI({ feature, context })));
        }}
        className={cn(
          "inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-[13px] font-medium transition-colors duration-150",
          configured
            ? "border-border-strong bg-surface text-fg hover:bg-subtle"
            : "cursor-not-allowed border-dashed border-border-strong text-fg-subtle",
        )}
      >
        <Sparkles aria-hidden="true" className="size-4" />
        {label}
        {configured ? null : (
          <Badge tone="outline" className="ml-0.5">
            Not configured
          </Badge>
        )}
      </button>
      <span id={`${id}-state`} className="sr-only">
        {configured ? description : "Unavailable: AI provider not configured."}
      </span>
      {!configured && open ? (
        <p
          id={`${id}-note`}
          role="status"
          className="max-w-md text-[12.5px] leading-relaxed text-fg-muted"
        >
          {description} AI provider not configured: MedOS works fully without AI and never generates
          content without one. A provider can be set in a later version (see Settings).
        </p>
      ) : null}
      {result ? (
        result.ok ? (
          <div className="rounded-lg border border-border bg-surface p-3 text-sm">
            <p className="mb-1.5 text-[12px] font-medium text-fg-subtle">
              AI-generated ({result.provenance.provider}). Check it against your lecture.
            </p>
            <p className="whitespace-pre-wrap text-fg">{result.text}</p>
          </div>
        ) : (
          <p role="status" className="text-[12.5px] text-fg-muted">
            {result.message}
          </p>
        )
      ) : null}
    </div>
  );
}
