import AxeBuilder from "@axe-core/playwright";

import { ROUTES } from "./routes";
import { SIGNED_OUT, expect, formError, signIn, signUp, test } from "./support/test";
import { TEST_USER, uniqueUser } from "./support/users";

const FIXTURE_TEXT = "Pharmacodynamics";
const UNKNOWN_RESOURCE = "/api/resources/00000000-0000-4000-8000-000000000000";

test.describe("without a session", () => {
  test.use({ storageState: SIGNED_OUT });

  for (const route of ROUTES) {
    test(`${route.path} redirects to the login screen`, async ({ page }) => {
      await page.goto(route.path);

      await expect(page).toHaveURL(/\/login(\?|$)/);
      await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
    });
  }

  test("the redirect happens on the server, before any content is sent", async ({ request }) => {
    for (const path of ["/today", "/courses/pharmacology", "/settings"]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(307);
      expect(response.headers().location, path).toContain("/login");
      expect(await response.text(), path).not.toContain(FIXTURE_TEXT);
    }
  });

  test("page data requested the way the router does is refused too", async ({ request }) => {
    const response = await request.get("/today", {
      maxRedirects: 0,
      headers: { RSC: "1", "Next-Router-Prefetch": "1" },
    });
    expect(response.status()).toBe(307);
    expect(await response.text()).not.toContain(FIXTURE_TEXT);
  });

  test("a forged session cookie gets past nothing", async ({ page, context, baseURL }) => {
    await context.addCookies([
      { name: "medos.session_token", value: "forged.signature", url: baseURL ?? "" },
    ]);
    // The proxy's cookie check is satisfied; the page's own verification is what refuses.
    const document = await context.request.get("/today");
    expect(await document.text()).not.toContain(FIXTURE_TEXT);

    await page.goto("/today");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
    await expect(page.getByText(FIXTURE_TEXT)).toHaveCount(0);
  });

  test("private API addresses answer 401 and reveal nothing", async ({ request }) => {
    const response = await request.get(UNKNOWN_RESOURCE);
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ error: "Authentication required." });
  });

  test("there is no session to read", async ({ request }) => {
    const response = await request.get("/api/auth/get-session");
    expect(response.ok()).toBe(true);
    expect(await response.json()).toBeNull();
  });

  test("the login screen offers both methods and is keyboard usable", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveTitle("Sign in · MedOS");

    const email = page.getByLabel("Email");
    const password = page.getByLabel("Password");
    await expect(email).toHaveAttribute("type", "email");
    await expect(password).toHaveAttribute("type", "password");
    await expect(password).toHaveAttribute("autocomplete", "current-password");
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();

    // Google needs credentials this environment does not have: visible, but honestly unavailable.
    const google = page.getByRole("button", { name: "Continue with Google" });
    await expect(google).toBeDisabled();
    await expect(google).toHaveAccessibleDescription(/has not been set up/);

    await email.focus();
    await page.keyboard.press("Tab");
    await expect(password).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeFocused();
  });

  for (const colorScheme of ["light", "dark"] as const) {
    for (const path of ["/login", "/signup"]) {
      test(`${path} has no accessibility violations in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await page.goto(path);
        await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);

        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
          .analyze();
        expect(results.violations.map((violation) => violation.id)).toEqual([]);
      });
    }
  }

  test("wrong credentials are refused without saying which part was wrong", async ({ page }) => {
    const message = "Incorrect email or password.";

    // A real account with the wrong password, then an account that does not exist.
    await signIn(page, { ...TEST_USER, password: "not-the-right-password" });
    await expect(formError(page)).toHaveText(message);

    await signIn(page, { ...TEST_USER, email: "nobody@e2e.test" });
    await expect(formError(page)).toHaveText(message);
    await expect(page).toHaveURL(/\/login$/);
  });

  test("the browser validates an incomplete form before anything is sent", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page.getByLabel("Email")).toHaveJSProperty("validity.valid", false);
    await expect(page).toHaveURL(/\/login$/);
  });

  test("signing in returns to the page that was requested", async ({ page }) => {
    await page.goto("/flashcards");
    await expect(page).toHaveURL(/\/login\?next=%2Fflashcards$/);

    await page.getByLabel("Email").fill(TEST_USER.email);
    await page.getByLabel("Password").fill(TEST_USER.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page).toHaveURL(/\/flashcards$/);
    await expect(page.getByRole("heading", { level: 1, name: "Flashcards" })).toBeVisible();
  });

  test("the return address cannot point to another site", async ({ page }) => {
    await signIn(page, TEST_USER, "/login?next=//evil.example/phish");

    await expect(page).toHaveURL(/\/today$/);
  });

  test("a new account gets its own workspace and greeting", async ({ page }) => {
    const user = { ...uniqueUser("signup"), name: "Ada Lovelace" };
    await signUp(page, user);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Good afternoon, Ada");
    await page.goto("/settings");
    const account = page.getByRole("region", { name: "Account" });
    await expect(account).toContainText("Ada Lovelace");
    await expect(account).toContainText(user.email);
    // A different person from the shared test account.
    await expect(account).not.toContainText(TEST_USER.email);
  });

  test("an existing email cannot be registered again", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Name").fill("Impostor");
    await page.getByLabel("Email").fill(TEST_USER.email);
    await page.getByLabel("Password").fill("a-completely-different-password");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(formError(page)).toContainText("could not be created");
    await expect(page).toHaveURL(/\/signup$/);

    // The original account is untouched: its own password still works, the new one does not.
    await signIn(page, { ...TEST_USER, password: "a-completely-different-password" });
    await expect(formError(page)).toHaveText("Incorrect email or password.");
  });

  test("a short password is rejected by the form", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Name").fill("Short");
    await page.getByLabel("Email").fill(uniqueUser("short").email);
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByLabel("Password")).toHaveJSProperty("validity.tooShort", true);
    await expect(page).toHaveURL(/\/signup$/);
  });

  test("repeated failed sign-ins are rate limited", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("nobody@e2e.test");
    await page.getByLabel("Password").fill("not-the-right-password");
    const submit = page.getByRole("button", { name: "Sign in", exact: true });
    const alert = formError(page);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await submit.click();
      await expect(alert).toHaveText("Incorrect email or password.");
      await expect(submit).toBeEnabled();
    }
    await submit.click();
    await expect(alert).toHaveText("Too many attempts. Wait a moment, then try again.");
  });
});

test.describe("signing out", () => {
  // Its own account: ending the shared session would sign every other test out.
  test.use({ storageState: SIGNED_OUT });

  test("ends the session on the server, so the old cookie stops working", async ({
    page,
    browser,
  }) => {
    await signUp(page, uniqueUser("signout"));
    const stolen = await page.context().storageState();
    expect(stolen.cookies.some((cookie) => cookie.name === "medos.session_token")).toBe(true);

    await page.getByRole("button", { name: "Account" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/today");
    await expect(page).toHaveURL(/\/login$/);

    // Replaying the cookie captured before signing out gets nowhere.
    const replay = await browser.newContext({ storageState: stolen });
    const document = await replay.request.get("/today");
    expect(await document.text()).not.toContain(FIXTURE_TEXT);
    const replayPage = await replay.newPage();
    await replayPage.goto("/today");
    await expect(replayPage).toHaveURL(/\/login$/);
    const api = await replay.request.get(UNKNOWN_RESOURCE);
    expect(api.status()).toBe(401);
    await replay.close();
  });

  test("is also available from Settings", async ({ page }) => {
    await signUp(page, uniqueUser("settings-signout"));
    await page.goto("/settings");
    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/login$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("with a session", () => {
  test("the workspace opens and shows who is signed in", async ({ page }) => {
    await page.goto("/today");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Good afternoon, Test");

    await page.getByRole("button", { name: "Account" }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toContainText(TEST_USER.name);
    await expect(menu).toContainText(TEST_USER.email);
  });

  test("the session cookie is not readable by scripts", async ({ page, context }) => {
    await page.goto("/today");
    const cookie = (await context.cookies()).find((entry) => entry.name === "medos.session_token");

    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    expect(await page.evaluate(() => document.cookie)).not.toContain("session_token");
    expect(await page.evaluate(() => JSON.stringify(window.localStorage))).not.toMatch(
      /token|session/i,
    );
  });

  test("the login and sign-up screens send a signed-in user back to the workspace", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/today$/);
    await page.goto("/signup?next=/calendar");
    await expect(page).toHaveURL(/\/calendar$/);
  });

  test("resource addresses cannot be enumerated", async ({ request }) => {
    const missing = await request.get(UNKNOWN_RESOURCE);
    const malformed = await request.get("/api/resources/1");

    expect(missing.status()).toBe(404);
    expect(malformed.status()).toBe(404);
    expect(await missing.text()).toBe(await malformed.text());
    expect(missing.headers()["cache-control"]).toBe("private, no-store");
  });

  test("private pages are never cached by shared caches", async ({ request }) => {
    const response = await request.get("/today");
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toMatch(/private|no-store/);
  });
});
