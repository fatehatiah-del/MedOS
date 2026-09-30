"use client";

import { useSyncExternalStore } from "react";

import {
  SIDEBAR_STATES,
  SIDEBAR_STORAGE_KEY,
  type SidebarState,
} from "@/components/theme/theme-config";
import { createPreferenceStore } from "@/lib/preference-store";

/**
 * Desktop sidebar state. The value is mirrored to `data-sidebar` on <html> so
 * the collapsed layout is pure CSS (the `rail:` variant) and is applied before
 * first paint by the boot script.
 */
export const sidebarStore = createPreferenceStore<SidebarState>({
  key: SIDEBAR_STORAGE_KEY,
  values: SIDEBAR_STATES,
  fallback: "expanded",
  apply: (state) => {
    if (state === "collapsed") {
      document.documentElement.dataset.sidebar = "collapsed";
    } else {
      delete document.documentElement.dataset.sidebar;
    }
  },
});

export function useSidebarState(): SidebarState {
  return useSyncExternalStore(
    sidebarStore.subscribe,
    sidebarStore.get,
    sidebarStore.getServerSnapshot,
  );
}
