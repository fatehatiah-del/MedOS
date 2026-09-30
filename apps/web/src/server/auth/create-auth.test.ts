// @vitest-environment node
import {
  type Database,
  type DatabaseConnection,
  authAccounts,
  authSessions,
  createUserScope,
  users,
} from "@medos/database";
import { createTestDatabase } from "@medos/database/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MIN_PASSWORD_LENGTH } from "@/features/auth/messages";

import type { AuthConfig } from "./config";
import { type Auth, createAuth } from "./create-auth";

/*
 * The real authentication service against a real (in-memory) PostgreSQL
 * database with the tracked migrations applied. Only Google itself is absent.
 */

const baseConfig: AuthConfig = {
  secret: "test-secret-that-is-long-enough-to-be-accepted",
  baseURL: "http://localhost:3000",
  google: null,
  allowedEmails: null,
  production: false,
};

const PASSWORD = "correct horse battery staple";

let connection: DatabaseConnection;
let db: Database;
let auth: Auth;

beforeAll(async () => {
  connection = await createTestDatabase();
  db = connection.db;
  auth = createAuth(db, baseConfig);
});

afterAll(async () => {
  await connection.close();
});

let sequence = 0;
const uniqueEmail = () => `student-${(sequence += 1)}@example.test`;

/** Turns the Set-Cookie headers of a response into a Cookie request header. */
function cookieHeader(headers: Headers): Headers {
  const cookie = headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  return new Headers({ cookie });
}

async function signUp(email: string, name = "Test Student", service: Auth = auth) {
  return service.api.signUpEmail({
    body: { email, password: PASSWORD, name },
    returnHeaders: true,
  });
}

async function signIn(email: string, password = PASSWORD, service: Auth = auth) {
  return service.api.signInEmail({ body: { email, password }, returnHeaders: true });
}

async function status(action: () => Promise<unknown>): Promise<number | string> {
  try {
    await action();
  } catch (error) {
    if (typeof error === "object" && error !== null && "statusCode" in error) {
      return error.statusCode as number;
    }
    throw error;
  }
  return "succeeded";
}

describe("email and password sign-up", () => {
  it("creates the MedOS user itself, with a database-generated UUID", async () => {
    const email = uniqueEmail();
    const { response } = await signUp(email, "Ada Lovelace");

    const [row] = await db.select().from(users).where(eq(users.email, email));
    expect(row).toMatchObject({ email, displayName: "Ada Lovelace", emailVerified: false });
    expect(row?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.user.id).toBe(row?.id);
  });

  it("stores a salted hash, never the password", async () => {
    const first = uniqueEmail();
    const second = uniqueEmail();
    await signUp(first);
    await signUp(second);

    const accounts = await db
      .select({
        email: users.email,
        providerId: authAccounts.providerId,
        hash: authAccounts.password,
      })
      .from(authAccounts)
      .innerJoin(users, eq(users.id, authAccounts.userId));
    const hashOf = (email: string) => accounts.find((account) => account.email === email)?.hash;

    const hash = hashOf(first);
    expect(hash).toBeTruthy();
    expect(hash).not.toContain(PASSWORD);
    expect(hash?.length).toBeGreaterThan(64);
    // Same password, different salt: the stored values differ.
    expect(hashOf(second)).not.toBe(hash);
    expect(accounts.find((account) => account.email === first)?.providerId).toBe("credential");
  });

  it("never returns the hash to the caller", async () => {
    const { response } = await signUp(uniqueEmail());
    expect(JSON.stringify(response)).not.toMatch(/password|hash/i);
  });

  it("stores the email in lowercase", async () => {
    const email = uniqueEmail();
    await signUp(email.toUpperCase());

    expect(await db.select().from(users).where(eq(users.email, email))).toHaveLength(1);
    expect(await status(() => signIn(email))).toBe("succeeded");
  });

  it("refuses a second account for the same email and creates nothing", async () => {
    const email = uniqueEmail();
    await signUp(email);

    expect(await status(() => signUp(email))).not.toBe("succeeded");
    expect(await status(() => signUp(email.toUpperCase()))).not.toBe("succeeded");
    expect(await db.select().from(users).where(eq(users.email, email))).toHaveLength(1);
  });

  it("rejects passwords that are too short and malformed emails", async () => {
    const short = "x".repeat(MIN_PASSWORD_LENGTH - 1);
    expect(
      await status(() =>
        auth.api.signUpEmail({ body: { email: uniqueEmail(), password: short, name: "Short" } }),
      ),
    ).toBe(400);
    expect(
      await status(() =>
        auth.api.signUpEmail({ body: { email: "not-an-email", password: PASSWORD, name: "Bad" } }),
      ),
    ).toBe(400);
  });
});

describe("sign-in", () => {
  it("accepts the right password and rejects a wrong one", async () => {
    const email = uniqueEmail();
    await signUp(email);

    expect(await status(() => signIn(email))).toBe("succeeded");
    expect(await status(() => signIn(email, "wrong password entirely"))).toBe(401);
  });

  it("answers identically for a wrong password and an unknown account", async () => {
    const email = uniqueEmail();
    await signUp(email);
    const failure = async (address: string) => {
      try {
        await signIn(address, "wrong password entirely");
      } catch (error) {
        const { statusCode, body } = error as { statusCode: number; body: unknown };
        return { statusCode, body };
      }
      return null;
    };

    expect(await failure(email)).toEqual(await failure("nobody@example.test"));
  });
});

describe("sessions", () => {
  it("identifies the user from the session cookie and nothing else", async () => {
    const email = uniqueEmail();
    const { headers } = await signUp(email, "Grace Hopper");

    const session = await auth.api.getSession({ headers: cookieHeader(headers) });
    expect(session?.user).toMatchObject({ email, name: "Grace Hopper" });

    expect(await auth.api.getSession({ headers: new Headers() })).toBeNull();
    expect(
      await auth.api.getSession({
        headers: new Headers({ cookie: "medos.session_token=forged.value" }),
      }),
    ).toBeNull();
  });

  it("sets an HttpOnly, SameSite cookie that does not contain the user", async () => {
    const email = uniqueEmail();
    const { headers } = await signUp(email);
    const cookie = headers.getSetCookie().find((value) => value.startsWith("medos.session_token="));

    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//i);
    expect(cookie).toMatch(/Max-Age=604800/i);
    expect(decodeURIComponent(cookie ?? "")).not.toContain(email);
  });

  it("marks the cookie Secure when the site is served over HTTPS", async () => {
    const secure = createAuth(db, { ...baseConfig, baseURL: "https://medos.example" });
    const { headers } = await signUp(uniqueEmail(), "Secure", secure);
    const cookie = headers.getSetCookie().find((value) => value.includes("session_token="));

    expect(cookie).toMatch(/^__Secure-medos\.session_token=/);
    expect(cookie).toMatch(/;\s*Secure/i);
  });

  it("is ended by signing out: the same cookie no longer works", async () => {
    const email = uniqueEmail();
    const { headers, response } = await signUp(email);
    const cookies = cookieHeader(headers);
    const open = () =>
      db.select().from(authSessions).where(eq(authSessions.userId, response.user.id));

    expect(await open()).toHaveLength(1);
    expect(await auth.api.getSession({ headers: cookies })).not.toBeNull();

    await auth.api.signOut({ headers: cookies });

    // Deleted on the server, so replaying the old cookie is useless.
    expect(await open()).toHaveLength(0);
    expect(await auth.api.getSession({ headers: cookies })).toBeNull();
  });

  it("stops working once it has expired", async () => {
    const { headers, response } = await signUp(uniqueEmail());
    const cookies = cookieHeader(headers);

    await db
      .update(authSessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(authSessions.userId, response.user.id));

    expect(await auth.api.getSession({ headers: cookies })).toBeNull();
  });
});

describe("ownership", () => {
  it("binds data access to the authenticated user, and each user sees only their own", async () => {
    const alice = await signUp(uniqueEmail(), "Alice");
    const bob = await signUp(uniqueEmail(), "Bob");

    const scopeFor = async (headers: Headers) => {
      const session = await auth.api.getSession({ headers: cookieHeader(headers) });
      if (!session) throw new Error("expected a session");
      return createUserScope(db, session.user.id);
    };
    const aliceScope = await scopeFor(alice.headers);
    const bobScope = await scopeFor(bob.headers);

    expect(aliceScope.userId).toBe(alice.response.user.id);
    expect(bobScope.userId).toBe(bob.response.user.id);
    expect(aliceScope.userId).not.toBe(bobScope.userId);
    // New accounts start empty: nothing of anyone else's is visible.
    expect(await aliceScope.courses.list()).toEqual([]);
    expect(await bobScope.courses.list()).toEqual([]);
  });
});

describe("account allow-list", () => {
  it("lets only listed addresses create an account", async () => {
    const restricted = createAuth(db, { ...baseConfig, allowedEmails: ["owner@example.test"] });

    expect(await status(() => signUp("intruder@example.test", "Intruder", restricted))).toBe(403);
    expect(await db.select().from(users).where(eq(users.email, "intruder@example.test"))).toEqual(
      [],
    );
    expect(await status(() => signUp("owner@example.test", "Owner", restricted))).toBe("succeeded");
  });
});

describe("Google sign-in", () => {
  const post = (service: Auth, path: string, body: unknown, headers: Record<string, string> = {}) =>
    service.handler(
      new Request(`http://localhost:3000/api/auth${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
          ...headers,
        },
        body: JSON.stringify(body),
      }),
    );

  it("is unavailable, without a server error, until credentials are configured", async () => {
    const response = await post(auth, "/sign-in/social", { provider: "google", callbackURL: "/" });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });

  it("starts the OAuth flow at Google with this app's callback once configured", async () => {
    const withGoogle = createAuth(db, {
      ...baseConfig,
      google: { clientId: "test-client-id", clientSecret: "test-client-secret" },
    });

    const response = await post(withGoogle, "/sign-in/social", {
      provider: "google",
      callbackURL: "/today",
    });
    const { url } = (await response.json()) as { url: string };
    const target = new URL(url);

    expect(response.status).toBe(200);
    expect(target.origin).toBe("https://accounts.google.com");
    expect(target.searchParams.get("client_id")).toBe("test-client-id");
    expect(target.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/auth/callback/google",
    );
    // The client secret never appears in anything sent to the browser.
    expect(url).not.toContain("test-client-secret");
  });
});

describe("request protections", () => {
  const request = (headers: Record<string, string>, email = "nobody@example.test") =>
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ email, password: "wrong password entirely" }),
    });

  it("rejects sign-in posted from another site", async () => {
    const response = await auth.handler(
      request({ origin: "https://evil.example", cookie: "medos.session_token=anything" }),
    );
    expect(response.status).toBe(403);
  });

  it("rate-limits repeated sign-in attempts in production", async () => {
    const limited = createAuth(db, { ...baseConfig, production: true });
    const attempt = () =>
      limited.handler(
        request({ origin: "http://localhost:3000", "x-forwarded-for": "203.0.113.7" }),
      );

    const statuses: number[] = [];
    for (let index = 0; index < 5; index += 1) statuses.push((await attempt()).status);

    expect(statuses.slice(0, 3)).toEqual([401, 401, 401]);
    expect(statuses.slice(3)).toEqual([429, 429]);
  });
});
