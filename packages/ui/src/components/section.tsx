import { type ComponentProps, type ReactNode, useId } from "react";

import { cn } from "../lib/cn";

/** Small uppercase label used as a section heading. */
export function SectionHeading({ className, ...props }: ComponentProps<"h2">) {
  return (
    <h2
      className={cn(
        "text-[11px] font-semibold tracking-[0.09em] text-fg-subtle uppercase",
        className,
      )}
      {...props}
    />
  );
}

export interface SectionProps {
  title: string;
  /** Optional content aligned to the end of the heading row. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** A labelled page section. */
export function Section({ title, aside, children, className }: SectionProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={cn("space-y-3", className)}>
      <div className="flex min-h-5 items-center justify-between gap-4">
        <SectionHeading id={headingId}>{title}</SectionHeading>
        {aside ? <div className="text-xs text-fg-subtle">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}
