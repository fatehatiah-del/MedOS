import type { ComponentProps } from "react";

import { cn } from "../lib/cn";

type SurfacePadding = "none" | "md" | "lg";

const paddings: Record<SurfacePadding, string> = {
  none: "",
  md: "p-5",
  lg: "p-6 sm:p-7",
};

export interface SurfaceProps extends ComponentProps<"div"> {
  padding?: SurfacePadding;
}

/** An elevated panel. Use sparingly: most structure should come from spacing and type. */
export function Surface({ padding = "none", className, ...props }: SurfaceProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface shadow-xs",
        paddings[padding],
        className,
      )}
      {...props}
    />
  );
}
