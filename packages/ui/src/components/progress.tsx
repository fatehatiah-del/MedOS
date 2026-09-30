import { cn } from "../lib/cn";

/** Completion as a whole percentage, clamped to 0–100. */
export function progressPercent(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.round(Math.min(Math.max(value / max, 0), 1) * 100);
}

export interface ProgressProps {
  value: number;
  max?: number;
  /** Accessible name, e.g. "Study time today". */
  label: string;
  /** Human-readable value announced instead of the raw number, e.g. "1h 20m of 2h 30m". */
  valueText?: string;
  className?: string;
}

export function Progress({ value, max = 100, label, valueText, className }: ProgressProps) {
  const percent = progressPercent(value, max);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={valueText}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-subtle", className)}
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-300"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
