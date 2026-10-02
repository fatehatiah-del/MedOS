import { resourceFileResponse } from "@/features/resources/file-response";
import { getOptionalUserScope } from "@/server/session";
import { getObjectStore } from "@/server/storage";

/**
 * The original PDF of one of the signed-in user's lectures, for the lecture
 * viewer (`?download=1` to save it). Private, never cached, and served only
 * when it is the user's own original lecture.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ resourceId: string }> },
): Promise<Response> {
  const [scope, { resourceId }] = await Promise.all([getOptionalUserScope(), params]);
  const download = new URL(request.url).searchParams.get("download") === "1";
  return resourceFileResponse(scope, resourceId, getObjectStore(), { download });
}
