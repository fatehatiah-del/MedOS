import { describe, expect, it } from "vitest";

import { STUDY_YEARS, YEAR_COOKIE, declaredYear, isOpenYear } from "./year";

describe("study years", () => {
  it("offers Years 1 to 3 and opens only Year 3", () => {
    expect(STUDY_YEARS.map((year) => year.label)).toEqual(["Year 1", "Year 2", "Year 3"]);
    expect(isOpenYear("3")).toBe(true);
    expect(isOpenYear(3)).toBe(true);
    for (const value of ["1", "2", "4", "", null, undefined]) expect(isOpenYear(value)).toBe(false);
  });

  it("reads the year from the form field, or from the cookie a Google sign-up sets", () => {
    expect(declaredYear({ body: { yearOfStudy: "3" } })).toBe("3");
    const headers = new Headers({ cookie: `other=1; ${YEAR_COOKIE}=3` });
    expect(declaredYear({ body: {}, headers })).toBe("3");
    expect(declaredYear({ body: {} })).toBeNull();
    expect(declaredYear(null)).toBeNull();
  });
});
