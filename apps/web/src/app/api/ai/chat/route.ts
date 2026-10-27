import { CHAT_LIMITS } from "@medos/ai";
import { z } from "zod";

import { getAIProvider } from "@/server/ai";
import { getCurrentUser } from "@/server/session";

/*
 * Ask AI: a question about the page on screen, answered as it is written.
 *
 * Signed-in users only, and only from MedOS's own pages (the browser's
 * Origin must be this site), so another site cannot spend the key. The page
 * text comes from the user's own screen and goes only to the configured
 * provider; nothing is stored.
 */

export const maxDuration = 60;

const body = z.object({
  page: z.object({
    title: z.string().max(500),
    path: z.string().max(1000),
    text: z.string().max(CHAT_LIMITS.pageText),
    selection: z.string().max(CHAT_LIMITS.selection).nullable(),
  }),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(CHAT_LIMITS.message),
      }),
    )
    .min(1)
    .max(CHAT_LIMITS.messages),
});

const plain = (status: number, message: string) =>
  new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });

export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return plain(403, "Not allowed.");
  if (!(await getCurrentUser())) return plain(401, "Sign in to use Ask AI.");

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return plain(400, "This question could not be sent. It may be too long.");

  const provider = getAIProvider();
  const result = await provider.streamChat({ ...parsed.data, signal: request.signal });
  if (!result.ok) return plain(result.reason === "not-configured" ? 503 : 502, result.message);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of result.chunks) controller.enqueue(encoder.encode(chunk));
      } catch {
        // The connection to the provider broke off; what arrived is kept.
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-ai-provider": result.provider,
      "x-ai-model": result.model,
    },
  });
}
