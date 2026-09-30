import { createAuthClient } from "better-auth/react";

/**
 * Browser-side client for the authentication endpoints under /api/auth.
 *
 * It only sends credentials and receives an HttpOnly session cookie; no token
 * is ever readable by scripts or kept in localStorage.
 */
export const authClient = createAuthClient();
