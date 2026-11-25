import { cn } from "@medos/ui";
import Image from "next/image";

/** The real screens shown on the welcome page, captured in both themes (public/welcome). */
export type ScreenName =
  "today-v3" | "guide-v2" | "mcq" | "recall" | "cards" | "plan" | "stats" | "calendar";

const WIDTH = 2160;
const HEIGHT = 1350;
/** The phone crop: the main column of the screen at a readable scale. */
const CROP_WIDTH = 1180;
const CROP_HEIGHT = 1250;

/**
 * A MedOS screen in a quiet frame. The light and dark captures are both
 * rendered and the theme decides which one shows, so the picture always
 * matches the page around it.
 */
export function Screenshot({
  name,
  alt,
  priority = false,
  sizes = "(min-width: 1280px) 1152px, 100vw",
  mobileCrop = false,
  className,
}: {
  name: ScreenName;
  /** Below 640px, show a readable crop of the main column instead of the whole window. */
  mobileCrop?: boolean;
  alt: string;
  priority?: boolean;
  sizes?: string;
  className?: string;
}) {
  const frame = (theme: "light" | "dark") => (
    <>
      {mobileCrop ? (
        <Image
          src={`/welcome/${name}-mobile-${theme}.webp`}
          alt={alt}
          width={CROP_WIDTH}
          height={CROP_HEIGHT}
          sizes="100vw"
          priority={priority}
          className="h-auto w-full rounded-[10px] sm:hidden"
        />
      ) : null}
      <Image
        src={`/welcome/${name}-${theme}.webp`}
        alt={alt}
        width={WIDTH}
        height={HEIGHT}
        unoptimized={name === "stats"}
        sizes={sizes}
        priority={priority}
        className={cn("h-auto w-full rounded-[10px]", mobileCrop && "hidden sm:block")}
      />
    </>
  );
  return (
    <div
      className={cn("rounded-2xl border border-border bg-canvas p-1.5 shadow-lg sm:p-2", className)}
    >
      {/* Each theme has its own captures; only the one matching the page is displayed. */}
      <div className="dark:hidden">{frame("light")}</div>
      <div className="hidden dark:block">{frame("dark")}</div>
    </div>
  );
}
