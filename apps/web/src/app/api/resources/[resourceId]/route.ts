import { resourceResponse } from "@/features/resources/resource-response";
import { getOptionalUserScope } from "@/server/session";

/**
 * Metadata of one of the signed-in user's resources. File contents will be
 * served from this same private address once storage exists; there are no
 * public file URLs.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ resourceId: string }> },
): Promise<Response> {
  const [scope, { resourceId }] = await Promise.all([getOptionalUserScope(), params]);
  return resourceResponse(scope, resourceId);
}
