/** Password rules, shared by the form (hints, validation) and the server (enforcement). */
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

export type AuthMode = "sign-in" | "sign-up";

/** The parts of an authentication failure the interface is allowed to react to. */
export interface AuthFailure {
  status?: number;
  code?: string;
}

export const GENERIC_AUTH_ERROR = "Something went wrong. Please try again.";

/**
 * What to tell the user when authentication fails.
 *
 * Messages are written here rather than passed through from the server, so
 * provider details never reach the screen, and so that failures which would
 * reveal whether an account exists all read the same.
 */
export function authErrorMessage(mode: AuthMode, failure: AuthFailure): string {
  const { status, code } = failure;

  if (status === 429) return "Too many attempts. Wait a moment, then try again.";
  if (code === "INVALID_EMAIL") return "Enter a valid email address.";
  if (code === "PASSWORD_TOO_SHORT") {
    return `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (code === "PASSWORD_TOO_LONG") {
    return `Use a password of at most ${MAX_PASSWORD_LENGTH} characters.`;
  }

  if (mode === "sign-in") {
    // Wrong password and unknown account are indistinguishable on purpose.
    if (status === 401 || status === 403 || code === "INVALID_EMAIL_OR_PASSWORD") {
      return "Incorrect email or password.";
    }
    return GENERIC_AUTH_ERROR;
  }

  // An existing account and an address that is not permitted read the same.
  if (status === 403 || status === 422 || code?.startsWith("USER_ALREADY_EXISTS")) {
    return "This account could not be created. If you already have one, sign in instead.";
  }
  return GENERIC_AUTH_ERROR;
}

/** Message for a failed return from Google, chosen by the `error` query parameter. */
export function oauthErrorMessage(error: string | undefined): string | null {
  if (!error) return null;
  return "Google sign-in could not be completed. If you already have an account with this email, sign in with your password.";
}

/**
 * The name used in greetings: the first word of the display name. Returns
 * null when there is nothing usable, so callers can drop the name entirely.
 */
export function greetingName(displayName: string | null | undefined): string | null {
  const first = displayName?.trim().split(/\s+/)[0];
  return first ? first : null;
}

/** "Good afternoon, Ada", or just "Good afternoon" without a name. */
export function personalGreeting(greeting: string, displayName: string | null | undefined): string {
  const name = greetingName(displayName);
  return name ? `${greeting}, ${name}` : greeting;
}

/** The letter shown on the account button. */
export function userInitial(displayName: string | null | undefined, email: string): string {
  const source = greetingName(displayName) ?? email;
  return (source[0] ?? "?").toUpperCase();
}
