import type { CourseId } from "@medos/shared";
import {
  CalendarDays,
  ChartNoAxesColumn,
  Layers,
  LibraryBig,
  ListChecks,
  type LucideIcon,
  MessageCircleQuestionMark,
  RotateCcw,
  Search,
  Settings,
  Sun,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const PRIMARY_NAV: readonly NavItem[] = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/courses", label: "Courses", icon: LibraryBig },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/study-plan", label: "Study Plan", icon: ListChecks },
  { href: "/review", label: "Review", icon: RotateCcw },
  { href: "/question-bank", label: "Question Bank", icon: MessageCircleQuestionMark },
  { href: "/flashcards", label: "Flashcards", icon: Layers },
  { href: "/search", label: "Search", icon: Search },
  { href: "/statistics", label: "Statistics", icon: ChartNoAxesColumn },
];

export const SETTINGS_NAV: NavItem = { href: "/settings", label: "Settings", icon: Settings };

export const HOME_HREF = "/today";

export function courseHref(courseId: CourseId): string {
  return `/courses/${courseId}`;
}

/**
 * The navigation entry that best matches `pathname`: the longest href that is
 * the path itself or one of its ancestors. On `/courses/pharmacology` the
 * course shortcut wins over the generic "Courses" entry.
 */
export function activeHref(pathname: string, hrefs: readonly string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    const matches = pathname === href || pathname.startsWith(`${href}/`);
    if (matches && (best === null || href.length > best.length)) best = href;
  }
  return best;
}
