import { COURSES } from "@medos/shared";
import { describe, expect, it } from "vitest";

import { PRIMARY_NAV, SETTINGS_NAV, activeHref, courseHref } from "./navigation";

const hrefs = [
  ...PRIMARY_NAV.map((item) => item.href),
  ...COURSES.map((course) => courseHref(course.id)),
  SETTINGS_NAV.href,
];

describe("navigation", () => {
  it("lists the primary destinations in the specified order", () => {
    expect(PRIMARY_NAV.map((item) => item.label)).toEqual([
      "Today",
      "Courses",
      "Calendar",
      "Study Plan",
      "Review",
      "Question Bank",
      "Flashcards",
      "Search",
      "Statistics",
    ]);
  });

  it("has no duplicate destinations", () => {
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("activeHref", () => {
  it("matches an exact path", () => {
    expect(activeHref("/today", hrefs)).toBe("/today");
  });

  it("prefers the most specific entry", () => {
    expect(activeHref("/courses", hrefs)).toBe("/courses");
    expect(activeHref("/courses/pharmacology", hrefs)).toBe("/courses/pharmacology");
    expect(activeHref("/courses/pharmacology/week-4", hrefs)).toBe("/courses/pharmacology");
  });

  it("does not match on a shared prefix", () => {
    expect(activeHref("/reviewer", hrefs)).toBeNull();
  });

  it("returns null for unknown paths", () => {
    expect(activeHref("/login", hrefs)).toBeNull();
  });
});
