import { Slot } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "../lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "icon";

const base =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap select-none " +
  "transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 " +
  "aria-disabled:cursor-not-allowed aria-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover disabled:hover:bg-accent",
  secondary:
    "border border-border-strong bg-surface text-fg shadow-xs hover:bg-subtle disabled:hover:bg-surface",
  ghost: "text-fg-muted hover:bg-hover hover:text-fg disabled:hover:bg-transparent",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-4 text-sm",
  icon: "size-9",
};

export interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Render the child element (for example a link) with button styling. */
  asChild?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  asChild = false,
  className,
  type,
  ...props
}: ButtonProps) {
  const classes = cn(base, variants[variant], sizes[size], className);
  if (asChild) {
    return <Slot.Root className={classes} {...props} />;
  }
  return <button type={type ?? "button"} className={classes} {...props} />;
}
