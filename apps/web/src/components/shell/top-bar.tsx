import { CURRENT_SEMESTER } from "@medos/shared";

import { ThemeMenu } from "@/components/theme/theme-menu";
import type { NavCourse } from "@/config/navigation";
import { TimerPill } from "@/features/timer/timer-pill";
import { getCurrentUser } from "@/server/session";

import { AccountMenu } from "./account-menu";
import { Brand } from "./brand";
import { MobileNav } from "./mobile-nav";
import { SearchTrigger } from "./search-trigger";

export async function TopBar({ courses }: { courses: readonly NavCourse[] }) {
  // Display only. Access is decided by each page, not by this component.
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-canvas/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <MobileNav courses={courses} />
      <div className="lg:hidden">
        <Brand />
      </div>

      <div className="ml-auto flex items-center gap-2 lg:ml-0 lg:flex-1 lg:justify-between">
        <SearchTrigger />
        <div className="flex items-center gap-2">
          {user ? <TimerPill /> : null}
          <p className="mr-1 hidden text-[13px] text-fg-subtle md:block">
            {CURRENT_SEMESTER.label} · {CURRENT_SEMESTER.name}
          </p>
          <ThemeMenu />
          {user ? <AccountMenu displayName={user.displayName} email={user.email} /> : null}
        </div>
      </div>
    </header>
  );
}
