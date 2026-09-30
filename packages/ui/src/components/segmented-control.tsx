"use client";

import { type ReactNode, useId } from "react";

import { cn } from "../lib/cn";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

export interface SegmentedControlProps<T extends string> {
  /** Accessible name for the group. */
  legend: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  className?: string;
}

/**
 * A single-choice control built on native radio inputs, so arrow-key
 * navigation and form semantics come from the browser.
 */
export function SegmentedControl<T extends string>({
  legend,
  options,
  value,
  onValueChange,
  className,
}: SegmentedControlProps<T>) {
  const name = useId();
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="sr-only">{legend}</legend>
      <div className="inline-flex rounded-lg bg-subtle p-1">
        {options.map((option) => (
          <label key={option.value} className="relative cursor-pointer">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onValueChange(option.value)}
              className="peer sr-only"
            />
            <span
              className={cn(
                "flex h-8 items-center gap-2 rounded-md px-3 text-[13px] font-medium text-fg-muted transition-colors duration-150",
                "peer-checked:bg-surface peer-checked:text-fg peer-checked:shadow-xs",
                "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
                "[&_svg]:size-4",
              )}
            >
              {option.icon}
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
