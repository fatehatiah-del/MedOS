"use client";

import { cn } from "@medos/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useId } from "react";

import { CourseMark } from "@/components/course-mark";
import {
  type NavCourse,
  PRIMARY_NAV,
  SETTINGS_NAV,
  activeHref,
  courseHref,
} from "@/config/navigation";

interface NavLinkProps {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  /** Shown as a native tooltip when labels are visually hidden. */
  showTitle: boolean;
  onNavigate?: () => void;
}

function NavLink({ href, label, icon, active, showTitle, onNavigate }: NavLinkProps) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={showTitle ? label : undefined}
      className={cn(
        "flex h-[30px] items-center gap-3 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors duration-150 rail:justify-center rail:px-0",
        active ? "bg-hover text-fg" : "text-fg-muted hover:bg-hover/60 hover:text-fg",
      )}
    >
      <span className="flex size-5 shrink-0 items-center justify-center [&_svg]:size-[17px]">
        {icon}
      </span>
      <span className="truncate rail:sr-only">{label}</span>
    </Link>
  );
}

export interface SidebarNavProps {
  /** The signed-in user's courses, in display order. */
  courses: readonly NavCourse[];
  /** True when labels are collapsed to an icon rail. */
  collapsed?: boolean;
  /** Called after a link is activated, e.g. to close the mobile drawer. */
  onNavigate?: () => void;
  /** Accessible name; must be unique when several navigations are rendered. */
  label?: string;
  /** Control shown beside Settings in the pinned footer, e.g. the collapse toggle. */
  footerAction?: ReactNode;
}

/**
 * Primary destinations and course shortcuts scroll if the window is short;
 * Settings stays pinned at the bottom.
 */
export function SidebarNav({
  courses,
  collapsed = false,
  onNavigate,
  label = "Main",
  footerAction,
}: SidebarNavProps) {
  const pathname = usePathname();
  const coursesLabelId = useId();
  const current = activeHref(pathname, [
    ...PRIMARY_NAV.map((item) => item.href),
    ...courses.map((course) => courseHref(course.slug)),
    SETTINGS_NAV.href,
  ]);
  const shared = { showTitle: collapsed, onNavigate };

  return (
    <nav aria-label={label} className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3 pt-2 pb-3">
        <ul className="space-y-0.5">
          {PRIMARY_NAV.map(({ href, label: itemLabel, icon: Icon }) => (
            <li key={href}>
              <NavLink
                href={href}
                label={itemLabel}
                icon={<Icon aria-hidden="true" strokeWidth={1.75} />}
                active={current === href}
                {...shared}
              />
            </li>
          ))}
        </ul>

        <div>
          <p
            id={coursesLabelId}
            className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-[0.09em] text-fg-subtle uppercase rail:sr-only"
          >
            Courses
          </p>
          <div aria-hidden="true" className="mx-2 mb-3 hidden h-px bg-border rail:block" />
          <ul aria-labelledby={coursesLabelId} className="space-y-0.5">
            {courses.map((course) => {
              const href = courseHref(course.slug);
              return (
                <li key={course.slug}>
                  <NavLink
                    href={href}
                    label={course.shortName}
                    icon={<CourseMark token={course.colorToken} />}
                    active={current === href}
                    {...shared}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 border-t border-border px-3 py-2 rail:flex-col rail:gap-0.5">
        <ul className="min-w-0 flex-1 rail:w-full">
          <li>
            <NavLink
              href={SETTINGS_NAV.href}
              label={SETTINGS_NAV.label}
              icon={<SETTINGS_NAV.icon aria-hidden="true" strokeWidth={1.75} />}
              active={current === SETTINGS_NAV.href}
              {...shared}
            />
          </li>
        </ul>
        {footerAction}
      </div>
    </nav>
  );
}
