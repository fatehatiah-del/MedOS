import type { ReactNode } from "react";

import type { NavCourse } from "@/config/navigation";
import { getOptionalWorkspace } from "@/server/workspace";

import { DesktopSidebar } from "./desktop-sidebar";
import { TopBar } from "./top-bar";

const MAIN_ID = "main-content";

/**
 * Course shortcuts come from the signed-in user's own courses, so the sidebar
 * and the course pages can never disagree. Display only: access is decided by
 * each page.
 */
async function navigationCourses(): Promise<NavCourse[]> {
  const workspace = await getOptionalWorkspace();
  if (!workspace) return [];
  const courses = await workspace.scope.courses.list();
  return courses
    .filter((course) => course.semesterId === workspace.semester.id)
    .map(({ slug, shortName, colorToken }) => ({ slug, shortName, colorToken }));
}

/** The signed-in application frame: sidebar, top bar and the page workspace. */
export async function AppShell({ children }: { children: ReactNode }) {
  const courses = await navigationCourses();

  return (
    <div className="flex min-h-dvh">
      <a
        href={`#${MAIN_ID}`}
        className="sr-only z-50 rounded-lg border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-fg shadow-lg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      <DesktopSidebar courses={courses} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar courses={courses} />
        <main
          id={MAIN_ID}
          tabIndex={-1}
          className="flex-1 px-5 pt-8 pb-20 focus:outline-none sm:px-8 lg:px-12 lg:pt-11"
        >
          {/* A container, so pages respond to the workspace width rather than the viewport
              (the sidebar can be expanded, collapsed or absent). */}
          <div className="@container mx-auto w-full max-w-[1080px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
