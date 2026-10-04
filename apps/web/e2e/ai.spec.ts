import type { Page } from "@playwright/test";

import { READER_STATE, readerFixture } from "./support/reader";
import { expect, test } from "./support/test";

/*
 * Phase 19: AI-ready, with no AI. With AI_PROVIDER=none every AI feature is
 * shown where it would be used, clearly unavailable, and nothing is ever
 * sent anywhere but MedOS itself. Read-only.
 */

const fixture = readerFixture();
test.use({ storageState: READER_STATE });

/** Records every request to a host other than MedOS's own. */
function watchExternalRequests(page: Page, baseURL: string | undefined) {
  const own = new URL(baseURL ?? "http://localhost").host;
  const external: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if ((url.protocol === "http:" || url.protocol === "https:") && url.host !== own) {
      external.push(request.url());
    }
  });
  return external;
}

async function expectUnavailable(page: Page, label: string) {
  const control = page.getByRole("button", { name: new RegExp(`^${label}`) });
  await expect(control).toHaveAttribute("aria-disabled", "true");
  await expect(control).toContainText("Not configured");
  await expect(control).toHaveAccessibleDescription("Unavailable: AI provider not configured.");
  // Focusable, so the explanation can be reached from the keyboard; pressing it only explains.
  await control.focus();
  await page.keyboard.press("Enter");
  await expect(control).toHaveAttribute("aria-expanded", "true");
  // This control's own explanation (another may already be open).
  const note = page.locator(`[id="${await control.getAttribute("aria-controls")}"]`);
  await expect(note).toHaveRole("status");
  await expect(note).toContainText("AI provider not configured");
}

test("lecture AI features are shown as unavailable", async ({ page, baseURL }) => {
  const external = watchExternalRequests(page, baseURL);
  await page.goto(`/courses/pharmacology/lectures/${fixture.lectureId}`);
  await expect(page.getByRole("region", { name: "AI assistance" })).toBeVisible();
  await expectUnavailable(page, "Ask MedOS");
  await expectUnavailable(page, "Generate Study Guide");
  expect(external).toEqual([]);
});

test("question generation is shown as unavailable", async ({ page, baseURL }) => {
  const external = watchExternalRequests(page, baseURL);
  await page.goto(`/courses/pharmacology/lectures/${fixture.lectureId}`);
  await page.getByRole("link", { name: /^Practise MCQ/ }).click();
  await expectUnavailable(page, "Generate USMLE questions");
  expect(external).toEqual([]);
});

test("Settings says no provider is configured", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByText("AI provider not configured")).toBeVisible();
  await expect(page.getByText("Provider:")).toContainText("none");
  const features = page.getByRole("list", { name: "AI features, unavailable" }).getByRole("button");
  await expect(features).toHaveCount(5);
  for (const button of await features.all()) await expect(button).toBeDisabled();
});
