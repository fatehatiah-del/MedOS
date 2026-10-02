import { describe, expect, it } from "vitest";

import { clampPage, fitScale, pageFromQuery, pageHref, pagesToDraw, stepZoom } from "./pages";
import { pageForSlide } from "./slides";

describe("lecture viewer rules", () => {
  it("keep page numbers within the PDF", () => {
    expect(clampPage(0, 10)).toBe(1);
    expect(clampPage(11, 10)).toBe(10);
    expect(clampPage(4.6, 10)).toBe(5);
    expect(clampPage(Number.NaN, 10)).toBe(1);
  });

  it("read a page from the address only when it exists", () => {
    expect(pageFromQuery("12", 101)).toBe(12);
    expect(pageFromQuery(["7", "8"], 101)).toBe(7);
    for (const value of ["0", "102", "-1", "1.5", "abc", "", undefined, "9999999"]) {
      expect(pageFromQuery(value, 101), String(value)).toBeNull();
    }
  });

  it("link to pages by address", () => {
    expect(pageHref("/l/original/r", 1)).toBe("/l/original/r");
    expect(pageHref("/l/original/r", 17)).toBe("/l/original/r?page=17");
  });

  it("step zoom through fixed levels, within limits", () => {
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(1, -1)).toBe(0.75);
    expect(stepZoom(1.1, 1)).toBe(1.25);
    expect(stepZoom(3, 1)).toBe(3);
    expect(stepZoom(0.5, -1)).toBe(0.5);
    expect(fitScale(800, 400)).toBe(2);
    expect(fitScale(100, 1000)).toBe(0.5);
    expect(fitScale(0, 400)).toBe(1);
  });

  it("draw only the pages in view and their neighbours", () => {
    const sorted = (pages: Set<number>) => [...pages].sort((x, y) => x - y);
    expect(sorted(pagesToDraw([1], 277))).toEqual([1, 2]);
    expect(sorted(pagesToDraw([100, 101], 277))).toEqual([99, 100, 101, 102]);
    expect(sorted(pagesToDraw([277], 277))).toEqual([276, 277]);
    expect(pagesToDraw([], 277).size).toBe(0);
  });

  it("link slides to pages only when a mapping is confirmed", () => {
    expect(pageForSlide(17, null)).toBeNull();
    expect(pageForSlide(17, { kind: "same-number", pageCount: 101 })).toBe(17);
    expect(pageForSlide(102, { kind: "same-number", pageCount: 101 })).toBeNull();
    expect(pageForSlide(0, { kind: "same-number", pageCount: 101 })).toBeNull();
  });
});
