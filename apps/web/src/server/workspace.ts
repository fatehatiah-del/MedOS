import "server-only";

import { type Semester, type UserScope, createUserScope, ensureWorkspace } from "@medos/database";
import { cache } from "react";

import { env } from "@/env";

import { getDatabase } from "./database";
import { type CurrentUser, getCurrentUser, requireUser } from "./session";

/** The signed-in user's academic workspace: who they are, their semester, and their data. */
export interface Workspace {
  user: CurrentUser;
  semester: Semester;
  scope: UserScope;
}

const open = cache(async (user: CurrentUser): Promise<Workspace> => {
  const db = await getDatabase();
  // Creates the semester and its courses the first time an account opens the workspace.
  const semester = await ensureWorkspace(db, user.id, {
    fixtureLectures: env.DEV_FIXTURE_LECTURES,
  });
  return { user, semester, scope: createUserScope(db, user.id) };
});

/**
 * The workspace of the signed-in user. Sends anyone else to the login page,
 * so it guards a page exactly as `requireUser()` does.
 */
export async function getWorkspace(): Promise<Workspace> {
  return open(await requireUser());
}

/** For layouts, which display data but must not decide access: null when signed out. */
export async function getOptionalWorkspace(): Promise<Workspace | null> {
  const user = await getCurrentUser();
  return user ? open(user) : null;
}
