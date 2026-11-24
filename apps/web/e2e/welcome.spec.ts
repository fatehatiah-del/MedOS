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

  test("walks through the learning cycle with the keyboard", async ({ page }) => {
    await page.goto("/");
    const steps = page.getByRole("tablist", { name: "Steps of the learning cycle" });
    await steps.getByRole("tab", { name: "Study guide" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(steps.getByRole("tab", { name: "MCQs" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { level: 3, name: "Test it" })).toBeVisible();
  });

  test("serves its screenshots without a session", async ({ request }) => {
    const response = await request.get("/welcome/today-light.webp", { maxRedirects: 0 });
    expect(response.status()).toBe(200);
  });

  test("has no accessibility violations", async ({ page }) => {
    await page.goto("/");
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
