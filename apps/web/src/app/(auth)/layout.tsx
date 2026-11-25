import { Check } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/brand-mark";
import { ThemeMenu } from "@/components/theme/theme-menu";
import { PRICE, TRIAL_DAYS } from "@/features/welcome/pricing";
import { Screenshot } from "@/features/welcome/screenshot";

/**
 * Layout for the public authentication screens: the form on one side and, on
 * large screens, what MedOS is on the other. Nothing about any account's
 * workspace is shown here; the picture is the public welcome-page screenshot.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-surface lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="flex min-h-dvh flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between px-5 sm:px-8">
          <Link href="/" aria-label="Med OS home" className="rounded-lg">
            <BrandMark />
          </Link>
          <ThemeMenu />
        </header>

        <main className="flex flex-1 items-center justify-center px-5 pt-6 pb-16 sm:px-8">
          <div className="w-full max-w-[380px] animate-rise-in">{children}</div>
        </main>
      </div>

      <aside
        aria-label="About Med OS"
        className="relative hidden overflow-hidden border-l border-border bg-canvas lg:flex lg:flex-col lg:justify-center lg:gap-10 lg:py-16 lg:pl-14"
      >
        <div className="max-w-md space-y-5 pr-14">
          <p className="font-display text-[30px] leading-[1.12] font-semibold text-balance text-fg">
            Every lecture, already turned into a study system.
          </p>
          <ul className="space-y-2.5 text-[15px] text-fg-muted">
            {[
              "Study guides, MCQs, active recall and flashcards for every lecture",
              "A daily plan built around your real timetable",
              `Open to Year 3 · ${TRIAL_DAYS} days free, then ${PRICE}/month`,
            ].map((item) => (
              <li key={item} className="flex gap-3">
                <Check
                  aria-hidden="true"
                  className="mt-0.5 size-[18px] shrink-0 text-accent"
                  strokeWidth={2.2}
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
        {/* Bleeds off the right edge, like a window behind the form. */}
        <Screenshot
          name="today-v3"
          alt="The Med OS Today screen."
          sizes="900px"
          className="w-[900px] max-w-none animate-rise-in [animation-delay:120ms]"
        />
      </aside>
    </div>
  );
}
