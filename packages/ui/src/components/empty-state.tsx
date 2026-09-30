import type { ReactNode } from "react";

import { cn } from "../lib/cn";

export interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  /** A small icon element, rendered inside a quiet circular well. */
  icon?: ReactNode;
  /** Optional action or status, e.g. a button or badge. */
  children?: ReactNode;
  /** `compact` suits panels; `default` suits a whole page region. */
  size?: "default" | "compact";
  /** Heading level for the title. Defaults to 3 (inside a labelled section). */
  headingLevel?: 2 | 3;
  className?: string;
}

/** The standard "nothing here yet" presentation, also used for unavailable features and errors. */
export function EmptyState({
  title,
  description,
  icon,
  children,
  size = "default",
  headingLevel = 3,
  className,
}: EmptyStateProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const compact = size === "compact";
  return (
    <div
      className={cn(
        "flex flex-col items-center text-center",
        compact ? "px-5 py-8" : "px-6 py-14",
        className,
      )}
    >
      {icon ? (
        <div
          aria-hidden="true"
          className={cn(
            "mb-4 flex items-center justify-center rounded-full bg-subtle text-fg-subtle [&_svg]:size-[18px]",
            compact ? "size-9" : "size-11",
          )}
        >
          {icon}
        </div>
      ) : null}
      <Heading className="text-[15px] font-medium text-fg">{title}</Heading>
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-pretty text-fg-muted">
          {description}
        </p>
      ) : null}
      {children ? <div className="mt-5 flex items-center gap-2">{children}</div> : null}
    </div>
  );
}
