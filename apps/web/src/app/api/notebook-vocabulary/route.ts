import { getOptionalUserScope } from "@/server/session";

/**
 * The words in the signed-in user's lectures and notebooks, for the notebook's
 * autocorrect (course terms it must leave alone). Private and never shared.
 */
export async function GET(): Promise<Response> {
  const scope = await getOptionalUserScope();
  if (!scope) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  const words = await scope.notebooks.vocabulary();
  return Response.json(
    { words },
    { headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" } },
  );
}
