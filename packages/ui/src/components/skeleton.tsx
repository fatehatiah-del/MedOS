import type { ComponentProps } from "react";

import { cn } from "../lib/cn";

/** Placeholder block shown while content loads. Decorative: hidden from assistive technology. */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-subtle", className)}
      {...props}
    />
  );
}
