import { cn } from "@medos/ui";

/**
 * The MedOS mark: a blue tile with the initial, and the wordmark beside it.
 * Decorative: whatever wraps it (a link, a heading) carries the accessible name.
 */
export function BrandMark({
  size = "md",
  wordmark = true,
  className,
  wordmarkClassName,
}: {
  size?: "sm" | "md" | "lg";
  wordmark?: boolean;
  className?: string;
  /** Extra classes for the wordmark, e.g. `rail:hidden` in the collapsible sidebar. */
  wordmarkClassName?: string;
}) {
  const tile = {
    sm: "size-6 text-[13px] rounded-[7px]",
    md: "size-7 text-[15px] rounded-[8px]",
    lg: "size-9 text-[19px] rounded-[10px]",
  }[size];
  const word = { sm: "text-[15px]", md: "text-[16.5px]", lg: "text-[20px]" }[size];
  return (
    <span aria-hidden="true" className={cn("flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "flex shrink-0 items-center justify-center bg-accent leading-none font-bold text-accent-fg",
          "shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_1px_2px_rgb(14_17_23/0.18)]",
          tile,
        )}
      >
        M
      </span>
      {wordmark ? (
        <span
          className={cn("font-display leading-none font-semibold text-fg", word, wordmarkClassName)}
        >
          MedOS
        </span>
      ) : null}
    </span>
  );
}
