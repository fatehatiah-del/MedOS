import { describe, expect, it } from "vitest";

import { AuthConfigError, isEmailAllowed, resolveAuthConfig } from "./config";

const secret = "s".repeat(32);

describe("resolveAuthConfig", () => {
  it("needs only a secret in development", () => {
    expect(resolveAuthConfig({ AUTH_SECRET: secret })).toEqual({
      secret,
      baseURL: undefined,
      google: null,
      allowedEmails: null,
      production: false,
    });
  });

  it("requires a secret, and says how to create one", () => {
    expect(() => resolveAuthConfig({})).toThrow(AuthConfigError);
    expect(() => resolveAuthConfig({ AUTH_SECRET: "  " })).toThrow(/npm run auth:secret/);
  });

  it("rejects a secret that is too short, without echoing it", () => {
    const attempt = () => resolveAuthConfig({ AUTH_SECRET: "hunter2" });
    expect(attempt).toThrow(/at least 32 characters/);
    expect(attempt).not.toThrow(/hunter2/);
  });

  it("requires the public URL in production", () => {
    const production = { NODE_ENV: "production", AUTH_SECRET: secret };
    expect(() => resolveAuthConfig(production)).toThrow(/APP_URL must be set in production/);
    expect(resolveAuthConfig({ ...production, APP_URL: "https://medos.example" })).toMatchObject({
      baseURL: "https://medos.example",
      production: true,
    });
  });

  it("enables Google only when both credentials are present", () => {
    const google = { AUTH_GOOGLE_CLIENT_ID: "id", AUTH_GOOGLE_CLIENT_SECRET: "shh" };
    expect(resolveAuthConfig({ AUTH_SECRET: secret, ...google }).google).toEqual({
      clientId: "id",
      clientSecret: "shh",
    });
    expect(() => resolveAuthConfig({ AUTH_SECRET: secret, AUTH_GOOGLE_CLIENT_ID: "id" })).toThrow(
      /must both be set/,
    );
  });

  it("parses the allow-list, ignoring case and spacing", () => {
    const config = resolveAuthConfig({
      AUTH_SECRET: secret,
      AUTH_ALLOWED_EMAILS: " Me@Example.test , second@example.test ",
    });
    expect(config.allowedEmails).toEqual(["me@example.test", "second@example.test"]);
    expect(() =>
      resolveAuthConfig({ AUTH_SECRET: secret, AUTH_ALLOWED_EMAILS: "not-an-email" }),
    ).toThrow(/AUTH_ALLOWED_EMAILS/);
  });

  it("reports every problem at once", () => {
    expect(() => resolveAuthConfig({ NODE_ENV: "production", APP_URL: "nope" })).toThrow(
      /AUTH_SECRET[\s\S]*APP_URL/,
    );
  });
});

describe("isEmailAllowed", () => {
  it("allows everyone when no allow-list is set", () => {
    expect(isEmailAllowed({ allowedEmails: null }, "anyone@example.test")).toBe(true);
  });

  it("allows only listed addresses, case-insensitively", () => {
    const config = { allowedEmails: ["me@example.test"] };
    expect(isEmailAllowed(config, "ME@example.test")).toBe(true);
    expect(isEmailAllowed(config, "other@example.test")).toBe(false);
  });
});
