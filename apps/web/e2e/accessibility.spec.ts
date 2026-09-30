import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./support/test";

import { ROUTES } from "./routes";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`accessibility in the ${colorScheme} theme`, () => {
    test.use({ colorScheme });

    for (const route of ROUTES) {
      test(`${route.path} has no detectable violations`, async ({ page }) => {
        await page.goto(route.path);
        await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

        const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
        const summary = results.violations.map((violation) => ({
          rule: violation.id,
          targets: violation.nodes.map((node) => node.target.join(" ")),
        }));
        expect(summary).toEqual([]);
      });
    }
  });
}

test("dialogs are accessible when open", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "View shortcuts" }).click();
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(dialog).toBeVisible();

  const results = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(WCAG_TAGS)
    .analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "View shortcuts" })).toBeFocused();
});
