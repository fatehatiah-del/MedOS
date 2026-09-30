import { z } from "zod";

/**
 * Authentication settings, resolved from environment variables.
 *
 * Kept separate from the code that reads `process.env`, so the rules can be
 * tested directly. Nothing here is ever sent to the browser.
 */
export interface AuthConfig {
  /** Signs session cookies. */
  secret: string;
  /** Public origin of the app. Undefined only in development, where it follows the request. */
  baseURL: string | undefined;
  /** Present only when both Google credentials are configured. */
  google: { clientId: string; clientSecret: string } | null;
  /** When set, only these addresses may have an account. */
  allowedEmails: readonly string[] | null;
  production: boolean;
}

export class AuthConfigError extends Error {
  override name = "AuthConfigError";
}

/** A secret shorter than this is too easy to guess to protect sessions. */
export const MIN_SECRET_LENGTH = 32;

const emailList = z
  .string()
  .transform((value) =>
    value
      .split(/[\s,]+/)
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  )
  .pipe(z.array(z.email()));

type EnvSource = Record<string, string | undefined>;

const read = (source: EnvSource, name: string): string | undefined => {
  const value = source[name]?.trim();
  return value ? value : undefined;
};

export function resolveAuthConfig(source: EnvSource): AuthConfig {
  const production = source.NODE_ENV === "production";
  const problems: string[] = [];

  const secret = read(source, "AUTH_SECRET");
  if (!secret) {
    problems.push("AUTH_SECRET is not set. Generate one with: npm run auth:secret");
  } else if (secret.length < MIN_SECRET_LENGTH) {
    problems.push(`AUTH_SECRET must be at least ${MIN_SECRET_LENGTH} characters long.`);
  }

  const baseURL = read(source, "APP_URL");
  if (baseURL && !URL.canParse(baseURL)) {
    problems.push("APP_URL must be a full URL such as https://medos.example.");
  } else if (!baseURL && production) {
    // Without it, the origin check that protects sign-in from other sites has nothing to compare to.
    problems.push("APP_URL must be set in production.");
  }

  const clientId = read(source, "AUTH_GOOGLE_CLIENT_ID");
  const clientSecret = read(source, "AUTH_GOOGLE_CLIENT_SECRET");
  if (Boolean(clientId) !== Boolean(clientSecret)) {
    problems.push(
      "AUTH_GOOGLE_CLIENT_ID and AUTH_GOOGLE_CLIENT_SECRET must both be set, or both left empty.",
    );
  }

  let allowedEmails: readonly string[] | null = null;
  const rawAllowed = read(source, "AUTH_ALLOWED_EMAILS");
  if (rawAllowed) {
    const parsed = emailList.safeParse(rawAllowed);
    if (parsed.success) {
      allowedEmails = parsed.data;
    } else {
      problems.push("AUTH_ALLOWED_EMAILS must be a comma-separated list of email addresses.");
    }
  }

  if (problems.length > 0 || !secret) {
    throw new AuthConfigError(
      `Authentication is not configured correctly:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`,
    );
  }

  return {
    secret,
    baseURL,
    google: clientId && clientSecret ? { clientId, clientSecret } : null,
    allowedEmails,
    production,
  };
}

/** Whether an address may have an account under the configured allow-list. */
export function isEmailAllowed(config: Pick<AuthConfig, "allowedEmails">, email: string): boolean {
  if (config.allowedEmails === null) return true;
  return config.allowedEmails.includes(email.trim().toLowerCase());
}
