import { exportResponse } from "@/features/export/export-response";
import { getOptionalUserScope } from "@/server/session";

/**
 * Downloads the signed-in user's data: `?format=all|json|csv|markdown|anki`.
 * Private and never cached; see `exportResponse`.
 */
export async function GET(request: Request): Promise<Response> {
  const format = new URL(request.url).searchParams.get("format");
  return exportResponse(await getOptionalUserScope(), format);
}
