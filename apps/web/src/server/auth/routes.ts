/**
 * Which paths exist outside the private workspace. Everything else requires a
 * session: the list is an allow-list, so a route added later is private unless
 * it is deliberately named here.
 */

export const LOGIN_PATH = "/login";
export const SIGNUP_PATH = "/signup";
export const AFTER_SIGN_IN_PATH = "/today";

/** Better Auth serves its endpoints, including the OAuth callback, under this prefix. */
export const AUTH_API_PREFIX = "/api/auth";

/** Session cookies are named `<prefix>.session_token` (with `__Secure-` in front over HTTPS). */
export const AUTH_COOKIE_PREFIX = "medos";

const PUBLIC_PAGES: readonly string[] = [LOGIN_PATH, SIGNUP_PATH];

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PAGES.includes(pathname)) return true;
  return pathname === AUTH_API_PREFIX || pathname.startsWith(`${AUTH_API_PREFIX}/`);
}

export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/**
 * Where to send someone after signing in. Only same-site paths are accepted;
 * anything else (absolute URLs, protocol-relative URLs, backslash tricks, the
 * auth pages themselves) falls back to the default, so the `next` parameter
 * can never be used to redirect a user to another site.
 */
export function safeRedirectPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return AFTER_SIGN_IN_PATH;
  }

  let parsed: URL;
  try {
    parsed = new URL(next, "http://medos.invalid");
  } catch {
    return AFTER_SIGN_IN_PATH;
  }
  if (parsed.origin !== "http://medos.invalid") return AFTER_SIGN_IN_PATH;
  if (isPublicPath(parsed.pathname) || isApiPath(parsed.pathname)) return AFTER_SIGN_IN_PATH;

  // Dot segments are resolved by the parser and can leave a protocol-relative path behind.
  const target = `${parsed.pathname}${parsed.search}`;
  return target.startsWith("//") ? AFTER_SIGN_IN_PATH : target;
}

/** The login URL that returns to `pathname` afterwards. */
export function loginPathFor(pathname: string, search = ""): string {
  const target = safeRedirectPath(`${pathname}${search}`);
  if (target === AFTER_SIGN_IN_PATH || pathname === "/") return LOGIN_PATH;
  return `${LOGIN_PATH}?next=${encodeURIComponent(target)}`;
}
