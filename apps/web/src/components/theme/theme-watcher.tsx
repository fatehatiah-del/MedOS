"use client";

import { useEffect } from "react";

import { DARK_MEDIA_QUERY } from "./theme-config";
import { applyTheme, themeStore } from "./theme-store";

/** Keeps the "System" theme in step with the operating system while the app is open. */
export function ThemeWatcher() {
  useEffect(() => {
    const media = window.matchMedia(DARK_MEDIA_QUERY);
    const sync = () => applyTheme(themeStore.get());
    // The system setting may have changed between the boot script and hydration.
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return null;
}
