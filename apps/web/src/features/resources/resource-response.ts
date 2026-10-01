import type { UserScope } from "@medos/database";

// Private data must never be stored by shared caches or the browser's disk cache.
const PRIVATE = { "Cache-Control": "private, no-store" };

const json = (body: unknown, status: number) => Response.json(body, { status, headers: PRIVATE });

/**
 * Answers a request for a resource by id.
 *
 * - No session: 401.
 * - A resource that belongs to someone else, does not exist, or has a
 *   malformed id: the same 404. A caller cannot learn which ids are real, so
 *   resource addresses cannot be enumerated.
 * - Otherwise the resource summary, which never includes where the file is
 *   stored.
 */
export async function resourceResponse(
  scope: UserScope | null,
  resourceId: string,
): Promise<Response> {
  if (!scope) return json({ error: "Authentication required." }, 401);

  const resource = await scope.resources.get(resourceId);
  if (!resource) return json({ error: "Not found." }, 404);

  return json(resource, 200);
}

/**
 * Answers a request for a resource's parsed content, with the same rules as
 * the resource itself: 401 without a session, the same 404 for anything that
 * is not the user's. Content is validated against its schema before it is
 * sent. Images inside it are named by hash only; nothing says where files live.
 */
export async function resourceContentResponse(
  scope: UserScope | null,
  resourceId: string,
): Promise<Response> {
  if (!scope) return json({ error: "Authentication required." }, 401);

  const view = await scope.resources.content(resourceId);
  if (!view) return json({ error: "Not found." }, 404);

  return json(view, 200);
}
