import { cn } from "@medos/ui";
import Image from "next/image";

/*
 * The Med OS logo from the brand kit (brand/BRAND.md): the outlined wordmark, whose O is a
 * stylised anatomical heart, in an ink version for light surfaces and a paper version for dark
 * ones. The files are used as they are: never recoloured or retyped in a live font.
 * Decorative here: whatever wraps it (a link, a heading) carries the accessible name.
 */

const WORDMARK_RATIO = 420.3 / 96.4;

const HEIGHTS = { sm: 18, md: 22, lg: 28 } as const;

export function BrandMark({
  size = "md",
  wordmark = true,
  className,
  wordmarkClassName,
}: {
  size?: keyof typeof HEIGHTS;
  /** False shows only the ring mark, for tight spaces. */
  wordmark?: boolean;
  className?: string;
  /** Extra classes for the wordmark, e.g. `rail:hidden` in the collapsible sidebar. */
  wordmarkClassName?: string;
}) {
  const height = HEIGHTS[size];
  const width = Math.round(height * WORDMARK_RATIO);
  const mark = Math.round(height * 1.45);
  return (
    <span aria-hidden="true" className={cn("flex items-center", className)}>
      {wordmark ? (
        <span className={cn("flex items-center", wordmarkClassName)}>
          <Image
            src="/brand/clinical-heart/medos-wordmark.svg"
            alt=""
            width={width}
            height={height}
            unoptimized
            priority
            className="block dark:hidden"
            style={{ height, width: "auto" }}
          />
          <Image
            src="/brand/clinical-heart/medos-wordmark-on-dark.svg"
            alt=""
            width={width}
            height={height}
            unoptimized
            priority
            className="hidden dark:block"
            style={{ height, width: "auto" }}
          />
        </span>
      ) : null}
      <Image
        src="/brand/clinical-heart/medos-mark.svg"
        alt=""
        width={mark}
        height={mark}
        unoptimized
        className={cn(wordmark ? "hidden" : "block", wordmarkClassName && "rail:block")}
        style={{ height: mark, width: mark }}
      />
    </span>
  );
}
