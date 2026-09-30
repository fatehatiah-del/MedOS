"use client";

import { Kbd } from "@medos/ui";
import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

export const SEARCH_HREF = "/search";
export const SEARCH_INPUT_ID = "global-search-input";

/**
 * Top-bar entry point to search, plus the global Ctrl+K (⌘K) shortcut.
 * The shortcut opens the search page, or focuses its field when already there.
 */
export function SearchTrigger() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "k") {
        return;
      }
      event.preventDefault();
      if (pathname === SEARCH_HREF) {
        document.getElementById(SEARCH_INPUT_ID)?.focus();
      } else {
        router.push(SEARCH_HREF);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pathname, router]);

  return (
    <Link
      href={SEARCH_HREF}
      aria-label="Search"
      aria-keyshortcuts="Control+K"
      className="flex h-9 items-center gap-2.5 rounded-lg border border-border bg-surface/70 px-3 text-[13px] text-fg-subtle transition-colors duration-150 hover:border-border-strong hover:text-fg-muted sm:w-64"
    >
      <Search aria-hidden="true" className="size-4 shrink-0" />
      <span className="hidden sm:inline">Search</span>
      <span aria-hidden="true" className="ml-auto hidden items-center gap-1 sm:flex">
        <Kbd>Ctrl</Kbd>
        <Kbd>K</Kbd>
      </span>
    </Link>
  );
}
