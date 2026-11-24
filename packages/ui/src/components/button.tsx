import { Slot } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "../lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "icon";

const base =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap select-none " +
  "transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out " +
  "active:scale-[0.97] disabled:active:scale-100 aria-disabled:active:scale-100 " +
  "disabled:cursor-not-allowed disabled:opacity-50 " +
  "aria-disabled:cursor-not-allowed aria-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_1px_2px_rgb(14_17_23/0.12)] " +
    "hover:bg-accent-hover disabled:hover:bg-accent",
  secondary:
    "border border-border bg-surface text-fg shadow-xs hover:border-border-strong hover:bg-subtle disabled:hover:bg-surface",
  ghost: "text-fg-muted hover:bg-hover hover:text-fg disabled:hover:bg-transparent",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-3.5 text-[13.5px]",
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
