import { READER_STATE, readerFixture } from "./support/reader";
import { SIGNED_OUT, expect, test } from "./support/test";

/*
 * Phase 22: the security checklist, verified against the production build.
 * Headers on every kind of response, a Content Security Policy whose nonce
 * changes with every request and covers the page's only inline script, and
 * every private API answering nothing without a session. (Every other E2E test
 * also fails on any CSP violation: see support/test.ts.)
 */

const fixture = readerFixture();

const STATIC_HEADERS = {
  "x-robots-tag": "noindex, nofollow",
  "strict-transport-security": "max-age=63072000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "same-origin",
  "cross-origin-opener-policy": "same-origin",
};

/** Every private API, with real ids of the reader's material where one is needed. */
const PRIVATE_APIS = [
  "/api/export?format=json",
  `/api/resources/${fixture.guideId}`,
  `/api/resources/${fixture.guideId}/content`,
  `/api/resources/${fixture.pdfId}/file`,
  `/api/resources/${fixture.guideId}/media/${fixture.guideImages[0]}`,
];

test.describe("signed out", () => {
  test.use({ storageState: SIGNED_OUT });

  test("the login page carries every security header and a nonce-based policy", async ({
    page,
  }) => {
    const response = await page.goto("/login");
    const headers = response!.headers();
    expect(headers).toMatchObject(STATIC_HEADERS);
    const policy = headers["content-security-policy"]!;
    expect(policy).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    // Scripts: no inline code without the nonce, no eval (only WebAssembly for the PDF viewer).
    const scripts = policy.split("; ").find((directive) => directive.startsWith("script-src "))!;
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");

    // The page's inline script runs under this request's nonce, and nothing else does.
    const nonce = /'nonce-([^']+)'/.exec(policy)![1];
    const inline = page.locator("head script:not([src])").first();
    expect(await inline.evaluate((element) => (element as HTMLScriptElement).nonce)).toBe(nonce);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("a new nonce for every request", async ({ request }) => {
    const nonceOf = async () =>
      /'nonce-([^']+)'/.exec(
        (await request.get("/login")).headers()["content-security-policy"]!,
      )![1];
    const first = await nonceOf();
    expect(first).not.toBe(await nonceOf());
  });

  test("static files carry the security headers too", async ({ page, request }) => {
    await page.goto("/login");
    const asset = await page.locator('script[src^="/_next/static/"]').first().getAttribute("src");
    const response = await request.get(asset!);
    expect(response.ok()).toBe(true);
    expect(response.headers()).toMatchObject(STATIC_HEADERS);
  });

  test("every private API answers 401, uncached, with nothing of the data", async ({ request }) => {
    for (const path of PRIVATE_APIS) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(401);
      expect(response.headers()["cache-control"], path).toBe("private, no-store");
      expect(await response.json(), path).toEqual({ error: "Authentication required." });
    }
  });

  test("a forged session cookie still reaches nothing", async ({ request }) => {
    for (const path of PRIVATE_APIS) {
      const response = await request.get(path, {
        headers: { cookie: "medos.session_token=forged.value" },
      });
      expect([401, 404], path).toContain(response.status());
      expect(response.headers()["cache-control"], path).toBe("private, no-store");
    }
  });
});

test.describe("signed in", () => {
  test.use({ storageState: READER_STATE });

  test("private pages carry the policy, and responses never name storage", async ({
    page,
    request,
  }) => {
    const response = await page.goto(`/courses/pharmacology/lectures/${fixture.lectureId}`);
    expect(response!.headers()["content-security-policy"]).toContain("'strict-dynamic'");
    expect(response!.headers()).toMatchObject(STATIC_HEADERS);

    for (const path of PRIVATE_APIS) {
      const api = await request.get(path);
      expect(api.ok(), path).toBe(true);
      expect(api.headers()["cache-control"], path).toBe("private, no-store");
      if ((api.headers()["content-type"] ?? "").includes("json")) {
        // Storage keys and folders stay on the server.
        expect(await api.text(), path).not.toMatch(
          /sha256\/[0-9a-f]{64}|storageKey|\.medos[\\/]|[\\/]objects[\\/]/,
        );
      }
    }
  });
});
