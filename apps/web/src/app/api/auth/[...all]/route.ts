import { getAuth } from "@/server/auth/auth";

/*
 * Authentication endpoints (sign-in, sign-up, sign-out, session, and the
 * Google OAuth callback at /api/auth/callback/google), served by Better Auth.
 */

async function handle(request: Request): Promise<Response> {
  const auth = await getAuth();
  return auth.handler(request);
}

export { handle as GET, handle as POST };
