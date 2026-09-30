import "server-only";

import { type UserScope, createUserScope } from "@medos/database";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { getAuth } from "./auth/auth";
import { LOGIN_PATH } from "./auth/routes";
import { getDatabase } from "./database";

/*
 * The trusted boundary.
 *
 * Every server-rendered page, route handler and server function decides who
 * is asking by calling one of these functions, which verify the session
 * cookie against the database. The identity always comes from that check,
 * never from anything the browser sends as data.
 */

/** The signed-in user, reduced to what the interface needs. Safe to pass to the client. */
export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
}

/** The signed-in user, or null. Verified once per request, however often it is called. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // Reading the request first also keeps this out of any build-time prerender.
  const requestHeaders = await headers();
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return null;

  const { id, email, name } = session.user;
  return { id, email, displayName: name };
});

/**
 * The signed-in user. Sends anyone else to the login page, so code after this
 * call only ever runs for an authenticated request. Call it in every private
 * page: layouts are not re-run on navigation and cannot guard a route alone.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(LOGIN_PATH);
  return user;
}

/** Data access bound to the signed-in user. The only way pages reach study data. */
export async function getUserScope(): Promise<UserScope> {
  const user = await requireUser();
  return createUserScope(await getDatabase(), user.id);
}

/** For route handlers, which answer with a status code instead of redirecting. */
export async function getOptionalUserScope(): Promise<UserScope | null> {
  const user = await getCurrentUser();
  return user ? createUserScope(await getDatabase(), user.id) : null;
}
