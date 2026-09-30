import { expect, test } from "@playwright/test";

import { ROUTES } from "./routes";

test("the root redirects to Today", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await expect(page).toHaveURL(/\/today$/);
  await expect(page).toHaveTitle("Today · MedOS");
});

for (const route of ROUTES) {
  test(`${route.path} renders its page heading without errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    const response = await page.goto(route.path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test(`${route.path} does not overflow horizontally`, async ({ page }) => {
    await page.goto(route.path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("an unknown course shows the not-found page", async ({ page }) => {
  const response = await page.goto("/courses/anatomy");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await page.getByRole("link", { name: "Go to Today" }).click();
  await expect(page).toHaveURL(/\/today$/);
});

test("private content is excluded from search indexing", async ({ page, request }) => {
  const response = await page.goto("/today");
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  const robots = await request.get("/robots.txt");
  expect(await robots.text()).toContain("Disallow: /");
});
