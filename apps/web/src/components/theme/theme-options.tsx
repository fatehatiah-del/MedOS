import { Monitor, Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";

import type { ThemePreference } from "./theme-config";

export const THEME_OPTIONS: readonly { value: ThemePreference; label: string; icon: ReactNode }[] =
  [
    { value: "light", label: "Light", icon: <Sun aria-hidden="true" /> },
    { value: "dark", label: "Dark", icon: <Moon aria-hidden="true" /> },
    { value: "system", label: "System", icon: <Monitor aria-hidden="true" /> },
  ];

export function isThemePreference(value: string): value is ThemePreference {
  return THEME_OPTIONS.some((option) => option.value === value);
}
