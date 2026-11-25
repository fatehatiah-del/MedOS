import AxeBuilder from "@axe-core/playwright";

import { SIGNED_OUT, expect, test } from "./support/test";

test.describe("the welcome page", () => {
  test.use({ storageState: SIGNED_OUT });

  test("greets visitors at the root and leads to sign-up", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Every lecture, already turned into a study system.",
      }),
    ).toBeVisible();
    await expect(page.getByText(/30 days free, then €9\.99\/month/).first()).toBeVisible();

    await page
      .getByRole("link", { name: /Start 30-day free trial/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/signup$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Create your account" }),
    ).toBeVisible();
  });

  test("presents the learning flow and its product examples in reading order", async ({ page }) => {
    await page.goto("/");
    const steps = page.getByRole("list", { name: "The Med OS learning cycle" });
    await expect(steps.getByRole("listitem")).toHaveCount(5);
    await expect(steps.getByRole("listitem").last()).toContainText("Build confidence");
    await expect(
      page.getByRole("heading", { name: "Retake the questions you got wrong." }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Ask Gemini Flash while you study." }),
    ).toBeVisible();
  });

  test("serves its screenshots without a session", async ({ request }) => {
    const response = await request.get("/welcome/today-v3-light.webp", { maxRedirects: 0 });
    expect(response.status()).toBe(200);
  });

  test("has no accessibility violations", async ({ page }) => {
    await page.goto("/");
    // Let the hero's entrance fade finish: mid-fade, axe samples half-transparent text.
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter(
            (a) =>
              a.timeline instanceof DocumentTimeline &&
              a.effect?.getComputedTiming().iterations !== Infinity,
          )
          .map((a) => a.finished.catch(() => undefined)),
      ),
    );
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
