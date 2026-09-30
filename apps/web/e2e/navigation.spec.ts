import { expect, test } from "./support/test";

import { COURSE_NAV_LABELS, ROUTES } from "./routes";

test.describe("desktop sidebar", () => {
  test.skip(({ isMobile }) => isMobile, "The sidebar is a desktop layout.");

  test("lists destinations, courses and settings in order", async ({ page }) => {
    await page.goto("/today");
    const nav = page.getByRole("navigation", { name: "Main", exact: true });
    await expect(nav.getByRole("link")).toHaveText([
      "Today",
      "Courses",
      "Calendar",
      "Study Plan",
      "Review",
      "Question Bank",
      "Flashcards",
      "Search",
      "Statistics",
      ...COURSE_NAV_LABELS,
      "Settings",
    ]);
  });

  test("navigates to every route and marks exactly one entry as current", async ({ page }) => {
    await page.goto("/today");
    const nav = page.getByRole("navigation", { name: "Main", exact: true });

    for (const route of ROUTES) {
      await nav.getByRole("link", { name: route.nav, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${route.path}$`));
      await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
      await expect(nav.locator('[aria-current="page"]')).toHaveText(route.nav);
    }
  });

  test("collapses to an icon rail and remembers it", async ({ page }) => {
    await page.goto("/today");
    const sidebar = page.locator("#app-sidebar");
    const expandedWidth = (await sidebar.boundingBox())?.width ?? 0;

    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-sidebar", "collapsed");
    await expect(page.getByRole("button", { name: "Expand sidebar" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect
      .poll(async () => (await sidebar.boundingBox())?.width ?? 0)
      .toBeLessThan(expandedWidth / 2);
    // Links stay reachable by name while their labels are visually hidden.
    await expect(sidebar.getByRole("link", { name: "Calendar", exact: true })).toBeVisible();

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-sidebar", "collapsed");

    await page.getByRole("button", { name: "Expand sidebar" }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-sidebar", "collapsed");
  });

  test("is fully operable from the keyboard", async ({ page }) => {
    await page.goto("/today");

    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Skip to content" });
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeVisible();

    await page.keyboard.press("Tab"); // brand
    await page.keyboard.press("Tab"); // Today
    await page.keyboard.press("Tab"); // Courses
    await expect(
      page
        .getByRole("navigation", { name: "Main", exact: true })
        .getByRole("link", { name: "Courses", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/courses$/);
  });
});

test.describe("mobile navigation", () => {
  test.skip(({ isMobile }) => !isMobile, "The drawer is the tablet and mobile layout.");

  test("opens a drawer, navigates and closes", async ({ page }) => {
    await page.goto("/today");
    await expect(page.locator("#app-sidebar")).toBeHidden();

    await page.getByRole("button", { name: "Open navigation" }).click();
    const drawer = page.getByRole("dialog", { name: "Navigation" });
    await expect(drawer).toBeVisible();

    await drawer.getByRole("link", { name: "Flashcards", exact: true }).click();
    await expect(page).toHaveURL(/\/flashcards$/);
    await expect(drawer).toBeHidden();
    await expect(page.getByRole("heading", { level: 1, name: "Flashcards" })).toBeVisible();
  });

  test("the drawer closes with its close button", async ({ page }) => {
    await page.goto("/courses");
    await page.getByRole("button", { name: "Open navigation" }).click();
    const drawer = page.getByRole("dialog", { name: "Navigation" });
    await drawer.getByRole("button", { name: "Close navigation" }).click();
    await expect(drawer).toBeHidden();
  });
});

test("Ctrl+K opens search and focuses the field", async ({ page, isMobile }) => {
  test.skip(isMobile, "Keyboard shortcut is a desktop interaction.");
  await page.goto("/today");
  await page.keyboard.press("Control+k");
  await expect(page).toHaveURL(/\/search$/);
  const field = page.getByRole("searchbox", { name: "Search your study library" });
  await expect(field).toBeFocused();

  await field.fill("GPCR");
  await expect(page.getByRole("heading", { name: "No results for “GPCR”" })).toBeVisible();

  await page.getByRole("heading", { level: 1 }).click();
  await expect(field).not.toBeFocused();
  await page.keyboard.press("Control+k");
  await expect(field).toBeFocused();
});
