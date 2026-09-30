// @vitest-environment node
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/*
 * A structural guard. Layouts are not re-run when the user navigates between
 * pages, so a layout cannot protect a route by itself: every private page has
 * to verify the session itself. This test fails if a page or route handler is
 * added without doing so.
 */

const appDir = fileURLToPath(new URL("../app", import.meta.url));

function files(dir: string, name: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return files(full, name);
    return entry === name ? [full] : [];
  });
}

const relative = (file: string) => path.relative(appDir, file).replaceAll("\\", "/");

describe("the private boundary", () => {
  const pages = files(path.join(appDir, "(app)"), "page.tsx");

  it("covers every workspace page", () => {
    expect(pages.length).toBeGreaterThanOrEqual(11);
  });

  it.each(pages.map((file) => [relative(file), file]))(
    "%s verifies the session before rendering",
    (_name, file) => {
      const source = readFileSync(file, "utf8");
      // getWorkspace() calls requireUser() first; see the test below.
      expect(source).toMatch(/await (requireUser|getUserScope|getWorkspace)\(\)/);
    },
  );

  it("counts getWorkspace() as a session check only because it calls requireUser()", () => {
    const workspace = readFileSync(path.join(appDir, "..", "server", "workspace.ts"), "utf8");
    const body = workspace.slice(workspace.indexOf("export async function getWorkspace"));
    expect(body.slice(0, body.indexOf("\n}"))).toContain("await requireUser()");
  });

  it("verifies the session in every API route outside /api/auth", () => {
    const handlers = files(path.join(appDir, "api"), "route.ts").filter(
      (file) => !relative(file).startsWith("api/auth/"),
    );
    expect(handlers.length).toBeGreaterThan(0);
    for (const file of handlers) {
      expect(readFileSync(file, "utf8"), relative(file)).toMatch(
        /getOptionalUserScope\(\)|getCurrentUser\(\)|requireUser\(\)/,
      );
    }
  });

  it("keeps only the authentication pages outside the workspace", () => {
    const publicPages = files(appDir, "page.tsx")
      .map(relative)
      .filter((file) => !file.startsWith("(app)/"))
      .sort();
    // The root page only redirects into the workspace.
    expect(publicPages).toEqual(["(auth)/login/page.tsx", "(auth)/signup/page.tsx", "page.tsx"]);
  });
});
