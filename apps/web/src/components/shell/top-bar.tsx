import { CURRENT_SEMESTER } from "@medos/shared";

import { ThemeMenu } from "@/components/theme/theme-menu";

import { Brand } from "./brand";
import { MobileNav } from "./mobile-nav";
import { SearchTrigger } from "./search-trigger";

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-canvas/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <MobileNav />
      <div className="lg:hidden">
        <Brand />
      </div>

      <div className="ml-auto flex items-center gap-2 lg:ml-0 lg:flex-1 lg:justify-between">
        <SearchTrigger />
        <div className="flex items-center gap-3">
          <p className="hidden text-[13px] text-fg-subtle md:block">
            {CURRENT_SEMESTER.label} · {CURRENT_SEMESTER.name}
          </p>
          <ThemeMenu />
        </div>
      </div>
    </header>
  );
}
