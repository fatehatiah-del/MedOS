import { READER_STATE, READER_USER } from "./support/reader";
import { expect, signIn, signUp, test as setup } from "./support/test";
import { STORAGE_STATE, TEST_USER } from "./support/users";

// Creates the shared test account through the real sign-up screen and keeps its session.
setup("create the test account", async ({ page }) => {
  await signUp(page, TEST_USER);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Test");
  await page.context().storageState({ path: STORAGE_STATE });
});

// The reader account and its synthetic Study Guide are created before the server starts.
setup("sign in to the reader account", async ({ page }) => {
  await signIn(page, READER_USER);
  await expect(page).toHaveURL(/\/today$/);
  await page.context().storageState({ path: READER_STATE });
});
