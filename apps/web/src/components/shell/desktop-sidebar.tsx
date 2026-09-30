"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import type { NavCourse } from "@/config/navigation";

import { Brand } from "./brand";
import { SidebarNav } from "./sidebar-nav";
import { sidebarStore, useSidebarState } from "./sidebar-store";

const SIDEBAR_ID = "app-sidebar";

/** Persistent navigation for large screens. Collapses to an icon rail. */
export function DesktopSidebar({ courses }: { courses: readonly NavCourse[] }) {
  const collapsed = useSidebarState() === "collapsed";
  const toggleLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";

  return (
    <aside
      id={SIDEBAR_ID}
      data-collapsible
      className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border transition-[width] duration-200 lg:flex rail:w-[68px]"
    >
      <div className="flex h-14 shrink-0 items-center px-5 rail:justify-center rail:px-0">
        <Brand />
      </div>

      <SidebarNav
        courses={courses}
        collapsed={collapsed}
        footerAction={
          <button
            type="button"
            onClick={() => sidebarStore.set(collapsed ? "expanded" : "collapsed")}
            aria-expanded={!collapsed}
            aria-controls={SIDEBAR_ID}
            aria-label={toggleLabel}
            title={toggleLabel}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-subtle transition-colors duration-150 hover:bg-hover/60 hover:text-fg rail:w-full"
          >
            {/* Both icons render so the correct one shows before hydration. */}
            <PanelLeftClose
              aria-hidden="true"
              strokeWidth={1.75}
              className="size-[17px] rail:hidden"
            />
            <PanelLeftOpen
              aria-hidden="true"
              strokeWidth={1.75}
              className="hidden size-[17px] rail:block"
            />
          </button>
        }
      />
    </aside>
  );
}
