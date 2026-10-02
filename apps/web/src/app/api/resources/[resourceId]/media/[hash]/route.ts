import { resourceMediaResponse } from "@/features/resources/media-response";
import { getOptionalUserScope } from "@/server/session";
import { getObjectStore } from "@/server/storage";

/**
 * An image from one of the signed-in user's resources (a Study Guide figure),
 * addressed by the resource and the image's SHA-256. Private, never cached,
 * and served only when the image belongs to that resource.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ resourceId: string; hash: string }> },
): Promise<Response> {
  const [scope, { resourceId, hash }] = await Promise.all([getOptionalUserScope(), params]);
  return resourceMediaResponse(scope, resourceId, hash, getObjectStore());
}
