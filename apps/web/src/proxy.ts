import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

import { AUTH_COOKIE_PREFIX, isApiPath, isPublicPath, loginPathFor } from "@/server/auth/routes";
import { contentSecurityPolicy, createNonce } from "@/server/security-headers";

/**
 * First line of the private boundary: a request without a session cookie
 * never reaches a private route. Pages are redirected to the login screen and
 * API routes answer 401.
 *
 * This is deliberately only a cookie check (no database access on every
 * request). A cookie can be forged, so it is not what protects data: each
 * page and handler verifies the session itself through `src/server/session`.
 *
 * It also gives every response its Content Security Policy with a fresh
 * nonce. The nonce is passed on to rendering (the `x-nonce` request header),
 * where Next.js adds it to its own scripts and the root layout to its one
 * inline script.
 */
export function proxy(request: NextRequest) {
  const nonce = createNonce();
  const policy = contentSecurityPolicy(nonce, {
    development: process.env.NODE_ENV === "development",
    https: request.nextUrl.protocol === "https:",
  });
  const withPolicy = (response: NextResponse) => {
    response.headers.set("Content-Security-Policy", policy);
    return response;
  };
  const next = () => {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("Content-Security-Policy", policy);
    return withPolicy(NextResponse.next({ request: { headers } }));
  };

  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) return next();

  const hasSessionCookie = getSessionCookie(request, { cookiePrefix: AUTH_COOKIE_PREFIX }) !== null;
  if (hasSessionCookie) return next();

  if (isApiPath(pathname)) {
    return withPolicy(
      NextResponse.json(
        { error: "Authentication required." },
        { status: 401, headers: { "Cache-Control": "private, no-store" } },
      ),
    );
  }
  return withPolicy(NextResponse.redirect(new URL(loginPathFor(pathname, search), request.url)));
}

export const config = {
  // Everything except build assets and the crawler file, which carry no study content.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
