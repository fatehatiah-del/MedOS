import "server-only";

import { getDatabase } from "../database";

import { type AuthConfig, resolveAuthConfig } from "./config";
import { type Auth, createAuth } from "./create-auth";
import { giveLibraryTo } from "./library";

/* The application's single authentication service, created on first use. */

const store = globalThis as typeof globalThis & {
  __medosAuth?: Promise<Auth>;
  __medosAuthConfig?: AuthConfig;
};

/** Validated settings. Throws `AuthConfigError` with a full explanation if they are wrong. */
export function getAuthConfig(): AuthConfig {
  store.__medosAuthConfig ??= resolveAuthConfig(process.env);
  return store.__medosAuthConfig;
}

export async function getAuth(): Promise<Auth> {
  if (!store.__medosAuth) {
    const pending = (async () => {
      const db = await getDatabase();
      const config = getAuthConfig();
      return createAuth(db, config, {
        onUserCreated: (user) => giveLibraryTo(db, config.librarySourceEmail, user),
      });
    })();
    store.__medosAuth = pending;
    pending.catch(() => {
      if (store.__medosAuth === pending) delete store.__medosAuth;
    });
  }
  return store.__medosAuth;
}
