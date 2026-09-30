"use client";

import { useSyncExternalStore } from "react";

import { createPreferenceStore } from "@/lib/preference-store";

import {
  DARK_MEDIA_QUERY,
  THEME_PREFERENCES,
  THEME_STORAGE_KEY,
  type ThemePreference,
  resolveTheme,
} from "./theme-config";

export function applyTheme(preference: ThemePreference): void {
  const systemPrefersDark = window.matchMedia(DARK_MEDIA_QUERY).matches;
  document.documentElement.dataset.theme = resolveTheme(preference, systemPrefersDark);
}

export const themeStore = createPreferenceStore<ThemePreference>({
  key: THEME_STORAGE_KEY,
  values: THEME_PREFERENCES,
  fallback: "system",
  apply: applyTheme,
});

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(themeStore.subscribe, themeStore.get, themeStore.getServerSnapshot);
}
