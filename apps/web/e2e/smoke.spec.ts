import { expect, test } from "@playwright/test";

test("the application boots and renders", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await expect(page).toHaveTitle(/MedOS/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("private content is excluded from search indexing", async ({ page, request }) => {
  const response = await page.goto("/");
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  const robots = await request.get("/robots.txt");
  expect(await robots.text()).toContain("Disallow: /");
});
