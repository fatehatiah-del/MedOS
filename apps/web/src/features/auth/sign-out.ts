import { authClient } from "@/lib/auth-client";

/**
 * Ends the session on the server, then loads the login page with a full
 * navigation. The full load matters: it discards every private page the
 * browser's router had cached, so nothing can be shown by going "back".
 */
export async function signOut(): Promise<void> {
  try {
    await authClient.signOut();
  } finally {
    // Deliberately not the client router: see above.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }
}
