/** Theme constants and pure helpers. Safe to import from server and client code. */

export const THEME_STORAGE_KEY = "medos-theme";
export const SIDEBAR_STORAGE_KEY = "medos-sidebar";

export const THEME_PREFERENCES = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = "light" | "dark";

export const SIDEBAR_STATES = ["expanded", "collapsed"] as const;
export type SidebarState = (typeof SIDEBAR_STATES)[number];

export const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

/**
 * Runs before first paint so the stored theme and sidebar state are applied
 * without a flash. Kept as a string because it is inlined into <head>.
 */
export const BOOT_SCRIPT = `(function(){var d=document.documentElement;try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t!=="light"&&t!=="dark"){t=window.matchMedia(${JSON.stringify(
  DARK_MEDIA_QUERY,
)}).matches?"dark":"light"}d.dataset.theme=t;if(localStorage.getItem(${JSON.stringify(
  SIDEBAR_STORAGE_KEY,
)})==="collapsed"){d.dataset.sidebar="collapsed"}}catch(e){d.dataset.theme="light"}})();`;
