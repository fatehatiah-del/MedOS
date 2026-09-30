"use client";

import { SegmentedControl } from "@medos/ui";

import { THEME_OPTIONS } from "./theme-options";
import { themeStore, useThemePreference } from "./theme-store";

/** Theme choice for the Settings page. */
export function ThemeSetting() {
  const preference = useThemePreference();

  return (
    <SegmentedControl
      legend="Theme"
      options={THEME_OPTIONS}
      value={preference}
      onValueChange={themeStore.set}
    />
  );
}
