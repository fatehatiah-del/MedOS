import { describe, expect, it } from "vitest";

import {
  GENERIC_AUTH_ERROR,
  authErrorMessage,
  greetingName,
  oauthErrorMessage,
  personalGreeting,
  userInitial,
} from "./messages";

describe("authErrorMessage", () => {
  it("does not reveal whether an account exists when sign-in fails", () => {
    const wrongPassword = authErrorMessage("sign-in", {
      status: 401,
      code: "INVALID_EMAIL_OR_PASSWORD",
    });
    const unknownAccount = authErrorMessage("sign-in", { status: 401 });

    expect(wrongPassword).toBe("Incorrect email or password.");
    expect(unknownAccount).toBe(wrongPassword);
  });

  it("reads the same for a duplicate account and a disallowed address", () => {
    const duplicate = authErrorMessage("sign-up", {
      status: 422,
      code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
    });
    const disallowed = authErrorMessage("sign-up", { status: 403 });

    expect(duplicate).toMatch(/could not be created/);
    expect(disallowed).toBe(duplicate);
  });

  it("explains input problems the user can fix", () => {
    expect(authErrorMessage("sign-up", { code: "PASSWORD_TOO_SHORT" })).toMatch(/at least 10/);
    expect(authErrorMessage("sign-up", { code: "INVALID_EMAIL" })).toMatch(/valid email/);
  });

  it("explains rate limiting in both modes", () => {
    expect(authErrorMessage("sign-in", { status: 429 })).toMatch(/Too many attempts/);
    expect(authErrorMessage("sign-up", { status: 429 })).toMatch(/Too many attempts/);
  });

  it("never passes server or provider details through", () => {
    expect(authErrorMessage("sign-in", { status: 500, code: "FAILED_TO_CREATE_SESSION" })).toBe(
      GENERIC_AUTH_ERROR,
    );
    expect(authErrorMessage("sign-up", {})).toBe(GENERIC_AUTH_ERROR);
  });
});

describe("oauthErrorMessage", () => {
  it("is empty without an error and generic with one", () => {
    expect(oauthErrorMessage(undefined)).toBeNull();
    const message = oauthErrorMessage("account_not_linked");
    expect(message).toMatch(/Google sign-in could not be completed/);
    expect(message).not.toContain("account_not_linked");
  });
});

describe("greetings", () => {
  it("uses the first name", () => {
    expect(greetingName("Ada Lovelace")).toBe("Ada");
    expect(personalGreeting("Good afternoon", "  Grace   Hopper ")).toBe("Good afternoon, Grace");
  });

  it("falls back to no name at all", () => {
    expect(greetingName("")).toBeNull();
    expect(greetingName(undefined)).toBeNull();
    expect(personalGreeting("Good morning", "   ")).toBe("Good morning");
  });

  it("derives an initial from the name, or the email", () => {
    expect(userInitial("ada lovelace", "x@example.test")).toBe("A");
    expect(userInitial("", "zed@example.test")).toBe("Z");
  });
});
