import { type ComponentProps, type ReactNode, useId } from "react";

import { cn } from "../lib/cn";

/** A section heading: sentence case, a step above body text. */
export function SectionHeading({ className, ...props }: ComponentProps<"h2">) {
  return (
    <h2
      className={cn("text-[15px] font-semibold tracking-[-0.011em] text-fg", className)}
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
    <section aria-labelledby={headingId} className={cn("space-y-3.5", className)}>
      <div className="flex min-h-6 items-center justify-between gap-4">
        <SectionHeading id={headingId}>{title}</SectionHeading>
        {aside ? <div className="text-[13px] text-fg-subtle">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}
