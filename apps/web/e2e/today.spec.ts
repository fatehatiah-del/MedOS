import { expect, test } from "@playwright/test";

test.describe("Today", () => {
  test("presents the dashboard sections in priority order", async ({ page, isMobile }) => {
    await page.goto("/today");

    await expect(page.getByText("Wednesday, 30 September · Week 1")).toBeVisible();
    await expect(page.getByRole("note")).toContainText("Development preview");

    const regions = page.getByRole("region");
    await expect(regions).toHaveCount(6);
    const layout = await regions.evaluateAll((elements) =>
      elements.map((element) => {
        const labelledBy = element.getAttribute("aria-labelledby");
        const box = element.getBoundingClientRect();
        return {
          name: labelledBy ? (document.getElementById(labelledBy)?.textContent ?? "") : "",
          left: Math.round(box.left),
          top: Math.round(box.top),
        };
      }),
    );
    const byTop = (items: typeof layout) =>
      [...items].sort((a, b) => a.top - b.top).map((item) => item.name);

    if (isMobile) {
      // One column: the specified priority order, top to bottom.
      expect(byTop(layout)).toEqual([
        "Today's university schedule",
        "Recommended study plan",
        "Today's progress",
        "Due for review",
        "Courses",
        "Exam periods",
      ]);
    } else {
      // Two columns: what to do on the left, status on the right.
      const leftEdge = Math.min(...layout.map((item) => item.left));
      expect(byTop(layout.filter((item) => item.left === leftEdge))).toEqual([
        "Today's university schedule",
        "Recommended study plan",
        "Due for review",
      ]);
      expect(byTop(layout.filter((item) => item.left !== leftEdge))).toEqual([
        "Today's progress",
        "Courses",
        "Exam periods",
      ]);
    }
  });

  test("shows the fixture schedule, plan and progress", async ({ page }) => {
    await page.goto("/today");

    const schedule = page.getByRole("region", { name: "Today's university schedule" });
    await expect(schedule).toContainText("11:30–14:50");
    await expect(schedule).toContainText("Public & Global Health");
    await expect(schedule).toContainText("Sigma");

    const plan = page.getByRole("region", { name: "Recommended study plan" });
    await expect(plan.getByRole("listitem")).toHaveCount(3);
    await expect(plan).toContainText("Week 1 — Pharmacodynamics I");
    await expect(plan).toContainText("1h 40m planned");

    const progress = page.getByRole("progressbar", { name: "Study time today" });
    await expect(progress).toHaveAttribute("aria-valuenow", "53");
    await expect(progress).toHaveAttribute("aria-valuetext", "1h 20m of 2h 30m");

    const exams = page.getByRole("region", { name: "Exam periods" });
    await expect(exams).toContainText("12–18 November 2026");
    await expect(exams).toContainText("In 43 days");
  });

  test("links to each of the six courses", async ({ page }) => {
    await page.goto("/today");
    const courses = page.getByRole("region", { name: "Courses" });
    await expect(courses.getByRole("link")).toHaveCount(6);
    await courses.getByRole("link", { name: "Communication Skills" }).click();
    await expect(page).toHaveURL(/\/courses\/communication-skills$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Communication Skills" }),
    ).toBeVisible();
  });
});
