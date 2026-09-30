import type { ReactNode } from "react";

import { ThemeMenu } from "@/components/theme/theme-menu";

/**
 * Layout for the public authentication screens. They sit outside the
 * application shell and show nothing about the workspace behind them.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex h-14 shrink-0 items-center justify-end px-4 sm:px-6">
        <ThemeMenu />
      </div>

      <main className="flex flex-1 items-center justify-center px-5 pt-4 pb-20">
        <div className="w-full max-w-[368px]">
          <div className="mb-9 flex items-center justify-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex size-9 items-center justify-center rounded-[11px] bg-fg font-serif text-[19px] leading-none font-semibold text-canvas"
            >
              M
            </span>
            <span className="font-serif text-[22px] leading-none font-medium tracking-[-0.01em] text-fg">
              MedOS
            </span>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
