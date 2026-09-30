import type { ReactNode } from "react";

import { cn } from "../lib/cn";

export interface PageHeaderProps {
  title: ReactNode;
  /** Short context line above the title. */
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
      <div className="min-w-0 space-y-2">
        {eyebrow ? <p className="text-[13px] font-medium text-fg-subtle">{eyebrow}</p> : null}
        <h1 className="font-serif text-[28px] leading-[1.15] font-medium tracking-[-0.01em] text-balance text-fg sm:text-[32px]">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-[15px] leading-relaxed text-pretty text-fg-muted">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
