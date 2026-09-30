import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

import { AUTH_COOKIE_PREFIX, isApiPath, isPublicPath, loginPathFor } from "@/server/auth/routes";

/**
 * First line of the private boundary: a request without a session cookie
 * never reaches a private route. Pages are redirected to the login screen and
 * API routes answer 401.
 *
 * This is deliberately only a cookie check (no database access on every
 * request). A cookie can be forged, so it is not what protects data: each
 * page and handler verifies the session itself through `src/server/session`.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const hasSessionCookie = getSessionCookie(request, { cookiePrefix: AUTH_COOKIE_PREFIX }) !== null;
  if (hasSessionCookie) return NextResponse.next();

  if (isApiPath(pathname)) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  return NextResponse.redirect(new URL(loginPathFor(pathname, search), request.url));
}

export const config = {
  // Everything except build assets and the crawler file, which carry no study content.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
