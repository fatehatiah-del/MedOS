import type { ReactNode } from "react";

import { cn } from "../lib/cn";

export interface PageHeaderProps {
  title: ReactNode;
  /** Short context line (a date, a semester). Shown under the title, never above it. */
  eyebrow?: ReactNode;
  description?: ReactNode;
  /** Controls aligned to the end of the header. */
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, eyebrow, description, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-8",
        className,
      )}
    >
      <div className="min-w-0 space-y-1.5">
        <h1 className="font-display text-[26px] leading-[1.15] font-semibold text-balance text-fg sm:text-[30px]">
          {title}
        </h1>
        {eyebrow ? <p className="text-[13.5px] font-medium text-fg-subtle">{eyebrow}</p> : null}
        {description ? (
          <p className="max-w-2xl pt-0.5 text-[15px] leading-relaxed text-pretty text-fg-muted">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
