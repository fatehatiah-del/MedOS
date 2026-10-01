import { resourceContentResponse } from "@/features/resources/resource-response";
import { getOptionalUserScope } from "@/server/session";

/**
 * The structured content MedOS parsed from one of the signed-in user's
 * resources (a study guide's sections, a quiz's questions, …). Private, never
 * cached, and never public.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ resourceId: string }> },
): Promise<Response> {
  const [scope, { resourceId }] = await Promise.all([getOptionalUserScope(), params]);
  return resourceContentResponse(scope, resourceId);
}
