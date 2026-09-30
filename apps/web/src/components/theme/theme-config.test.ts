import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BOOT_SCRIPT, resolveTheme } from "./theme-config";

describe("resolveTheme", () => {
  it("uses an explicit preference regardless of the system setting", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("follows the system setting for the system preference", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("BOOT_SCRIPT", () => {
  const run = () => new Function(BOOT_SCRIPT)();
  const stubSystemDark = (matches: boolean) =>
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches })),
    );

  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.sidebar;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("applies the stored theme", () => {
    stubSystemDark(false);
    window.localStorage.setItem("medos-theme", "dark");
    run();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("falls back to the system theme when nothing is stored", () => {
    stubSystemDark(true);
    run();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("resolves the system preference through the media query", () => {
    stubSystemDark(false);
    window.localStorage.setItem("medos-theme", "system");
    run();
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("restores a collapsed sidebar", () => {
    stubSystemDark(false);
    window.localStorage.setItem("medos-sidebar", "collapsed");
    run();
    expect(document.documentElement.dataset.sidebar).toBe("collapsed");
  });
});
