import { expect, test } from "./support/test";

const html = "html";

test.describe("theme", () => {
  test("follows the system colour scheme by default", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/today");
    await expect(page.locator(html)).toHaveAttribute("data-theme", "dark");

    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator(html)).toHaveAttribute("data-theme", "light");
  });

  test("can be chosen in Settings and persists across reloads", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/settings");
    await expect(page.locator(html)).toHaveAttribute("data-theme", "light");
    const lightBackground = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );

    const theme = page.getByRole("group", { name: "Theme" });
    await expect(theme.getByRole("radio", { name: "System" })).toBeChecked();

    await theme.getByText("Dark", { exact: true }).click();
    await expect(theme.getByRole("radio", { name: "Dark" })).toBeChecked();
    await expect(page.locator(html)).toHaveAttribute("data-theme", "dark");
    const darkBackground = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(darkBackground).not.toBe(lightBackground);

    await page.reload();
    await expect(page.locator(html)).toHaveAttribute("data-theme", "dark");
    await expect(
      page.getByRole("group", { name: "Theme" }).getByRole("radio", { name: "Dark" }),
    ).toBeChecked();

    // An explicit choice wins over the system setting on other pages too.
    await page.goto("/today");
    await expect(page.locator(html)).toHaveAttribute("data-theme", "dark");
  });

  test("can be switched from the top bar menu", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/today");

    await page.getByRole("button", { name: "Theme" }).click();
    await page.getByRole("menuitemradio", { name: "Dark" }).click();
    await expect(page.locator(html)).toHaveAttribute("data-theme", "dark");

    await page.getByRole("button", { name: "Theme" }).click();
    await expect(page.getByRole("menuitemradio", { name: "Dark" })).toBeChecked();
    await page.getByRole("menuitemradio", { name: "Light" }).click();
    await expect(page.locator(html)).toHaveAttribute("data-theme", "light");
  });
});
