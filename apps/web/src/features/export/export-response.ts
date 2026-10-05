import type { UserScope } from "@medos/database";
import { EXPORT_KINDS, type ExportKind, exportFile } from "@medos/export";

import { contentDisposition } from "@/features/resources/file-response";

// Private data must never be stored by shared caches or the browser's disk cache.
const PRIVATE = { "Cache-Control": "private, no-store" };

const json = (body: unknown, status: number) => Response.json(body, { status, headers: PRIVATE });

const isKind = (value: string | null): value is ExportKind =>
  EXPORT_KINDS.includes(value as ExportKind);

/**
 * The signed-in user's data as a download, in the requested format.
 *
 * - No session: 401.
 * - An unknown format: 400.
 * - Otherwise the export, as an attachment, never cached and never sniffed.
 *   It holds only the user's own data: the snapshot is read through their scope.
 */
export async function exportResponse(
  scope: UserScope | null,
  format: string | null,
  now: Date = new Date(),
): Promise<Response> {
  if (!scope) return json({ error: "Authentication required." }, 401);
  if (!isKind(format)) {
    return json({ error: `Unknown export format. Use one of: ${EXPORT_KINDS.join(", ")}.` }, 400);
  }

  const file = exportFile(await scope.export.snapshot(now), format);
  return new Response(new Uint8Array(file.body), {
    status: 200,
    headers: {
      ...PRIVATE,
      "Content-Type": file.contentType,
      "Content-Length": String(file.body.byteLength),
      "Content-Disposition": contentDisposition("attachment", file.filename),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
