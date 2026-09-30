import { describe, expect, it } from "vitest";

import { isPublicPath, loginPathFor, safeRedirectPath } from "./routes";

describe("isPublicPath", () => {
  it("allows only the authentication pages and endpoints", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/signup")).toBe(true);
    expect(isPublicPath("/api/auth/sign-in/email")).toBe(true);
    expect(isPublicPath("/api/auth/callback/google")).toBe(true);
  });

  it("treats every workspace and data route as private", () => {
    for (const path of [
      "/",
      "/today",
      "/courses",
      "/courses/pharmacology",
      "/calendar",
      "/study-plan",
      "/review",
      "/question-bank",
      "/flashcards",
      "/search",
      "/statistics",
      "/settings",
      "/api/resources/123",
      "/some-route-added-later",
    ]) {
      expect(isPublicPath(path), path).toBe(false);
    }
  });

  it("does not match on a shared prefix", () => {
    expect(isPublicPath("/login-help")).toBe(false);
    expect(isPublicPath("/api/authentication")).toBe(false);
    expect(isPublicPath("/login/extra")).toBe(false);
  });
});

describe("safeRedirectPath", () => {
  it("keeps same-site paths, including their query", () => {
    expect(safeRedirectPath("/courses/pharmacology")).toBe("/courses/pharmacology");
    expect(safeRedirectPath("/search?q=gpcr")).toBe("/search?q=gpcr");
  });

  it("falls back to Today when nothing is requested", () => {
    expect(safeRedirectPath(undefined)).toBe("/today");
    expect(safeRedirectPath(null)).toBe("/today");
    expect(safeRedirectPath("")).toBe("/today");
  });

  it("refuses to leave the site", () => {
    for (const hostile of [
      "https://evil.example/today",
      "//evil.example/today",
      "/\\evil.example",
      "\\\\evil.example",
      "javascript:alert(1)",
      "evil.example",
      "/%5C%5Cevil.example/..//evil.example",
    ]) {
      const result = safeRedirectPath(hostile);
      expect(result.startsWith("/"), hostile).toBe(true);
      expect(result.startsWith("//"), hostile).toBe(false);
      expect(result, hostile).not.toContain("\\");
    }
    expect(safeRedirectPath("https://evil.example/today")).toBe("/today");
    expect(safeRedirectPath("//evil.example/today")).toBe("/today");
  });

  it("never returns to an authentication page or an API endpoint", () => {
    expect(safeRedirectPath("/login")).toBe("/today");
    expect(safeRedirectPath("/signup?next=/today")).toBe("/today");
    expect(safeRedirectPath("/api/auth/sign-out")).toBe("/today");
    expect(safeRedirectPath("/api/resources/1")).toBe("/today");
  });
});

describe("loginPathFor", () => {
  it("remembers the page that was requested", () => {
    expect(loginPathFor("/courses/pharmacology")).toBe("/login?next=%2Fcourses%2Fpharmacology");
    expect(loginPathFor("/search", "?q=gpcr")).toBe("/login?next=%2Fsearch%3Fq%3Dgpcr");
  });

  it("stays plain for the default destination", () => {
    expect(loginPathFor("/")).toBe("/login");
    expect(loginPathFor("/today")).toBe("/login");
  });
});
