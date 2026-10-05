/*
 * HTTP security headers. Shared by next.config.ts (headers on every response)
 * and the proxy (the Content Security Policy, which carries a new nonce for
 * every request). Provider-independent: plain headers, no host features.
 */

/** Headers every response carries, static files included. */
export const SECURITY_HEADERS: readonly { key: string; value: string }[] = [
  // All study data is private: never allow indexing, on any host.
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  // Once a browser has seen MedOS over https, it never uses plain http for it again.
  // Browsers ignore this header over http, so it is harmless on this computer.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // No other site may show MedOS in a frame (also frame-ancestors in the CSP).
  { key: "X-Frame-Options", value: "DENY" },
  // Addresses of private pages never leave MedOS in a Referer header.
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // MedOS uses none of these. Fullscreen (the lecture viewer) keeps its default.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
];

/**
 * The Content Security Policy for one response. Scripts run only from MedOS
 * itself with this request's nonce (and what those scripts load:
 * 'strict-dynamic'); nothing may be loaded from or sent to another origin.
 *
 * - Styles allow inline attributes: components position elements with
 *   style="…", which a nonce cannot cover. Style cannot run code.
 * - 'wasm-unsafe-eval' lets the lecture viewer's pdf.js decode images with
 *   WebAssembly; it does not allow eval.
 * - Development adds 'unsafe-eval', which React uses for its error overlay.
 */
export function contentSecurityPolicy(
  nonce: string,
  { development = false, https = false }: { development?: boolean; https?: boolean } = {},
): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

/** A fresh, unguessable nonce. */
export function createNonce(): string {
  return btoa(crypto.randomUUID());
}
