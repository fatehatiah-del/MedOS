import type { ComponentProps } from "react";

import { cn } from "../lib/cn";

/** A keyboard key. */
export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface px-1.5 font-sans text-[11px] font-medium text-fg-subtle",
        className,
      )}
      {...props}
    />
  );
}
