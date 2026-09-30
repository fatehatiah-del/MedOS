import type { ReactNode } from "react";

import { cn } from "../lib/cn";

export type NoticeTone = "neutral" | "warning" | "danger";

const tones: Record<NoticeTone, string> = {
  neutral: "border-border bg-subtle/60 [&_svg]:text-fg-subtle",
  warning: "border-warning/25 bg-warning-soft [&_svg]:text-warning",
  danger: "border-danger/25 bg-danger-soft [&_svg]:text-danger",
};

export interface NoticeProps {
  title?: string;
  children: ReactNode;
  icon?: ReactNode;
  tone?: NoticeTone;
  className?: string;
}

/** An inline, non-blocking message that explains the state of the surrounding content. */
export function Notice({ title, children, icon, tone = "neutral", className }: NoticeProps) {
  return (
    <div
      role="note"
      className={cn(
        "flex gap-3 rounded-lg border px-4 py-3 text-sm leading-relaxed",
        tones[tone],
        className,
      )}
    >
      {icon ? (
        <span aria-hidden="true" className="mt-0.5 shrink-0 [&_svg]:size-4">
          {icon}
        </span>
      ) : null}
      <p className="min-w-0 text-pretty text-fg-muted">
        {title ? <span className="font-medium text-fg">{title} </span> : null}
        {children}
      </p>
    </div>
  );
}
