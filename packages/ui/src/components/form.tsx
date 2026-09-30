import type { ComponentProps, ReactNode } from "react";

import { cn } from "../lib/cn";

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("block text-sm font-medium text-fg", className)} {...props} />;
}

export function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "h-9 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-fg shadow-xs",
        "transition-colors duration-150 placeholder:text-fg-subtle",
        "focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent",
        "disabled:cursor-not-allowed disabled:bg-subtle disabled:text-fg-muted disabled:shadow-none",
        className,
      )}
      {...props}
    />
  );
}

/** Id of the hint rendered by `Field`, for `aria-describedby` on the control. */
export function fieldHintId(controlId: string): string {
  return `${controlId}-hint`;
}

export interface FieldProps {
  label: string;
  /** Id of the control this field labels. */
  htmlFor: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** A label, a control and an optional hint. */
export function Field({ label, htmlFor, hint, children, className }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? (
        <p id={fieldHintId(htmlFor)} className="text-xs leading-relaxed text-fg-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
