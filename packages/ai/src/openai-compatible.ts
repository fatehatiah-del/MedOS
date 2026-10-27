import { type ChatMessage, type PageContext, boundedConversation, systemPrompt } from "./chat";
import type { AIFailure } from "./provider";

/*
 * A chat provider for any service that speaks the OpenAI chat-completions
 * protocol: Google Gemini (through its OpenAI-compatible endpoint), DeepSeek,
 * and others given a base URL. The key stays on the server; the browser only
 * ever talks to MedOS.
 */

export interface CompatiblePreset {
  label: string;
  baseUrl: string;
  model: string;
}

export const COMPATIBLE_PRESETS = {
  gemini: {
    label: "Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.5-flash",
  },
  deepseek: { label: "DeepSeek", baseUrl: "https://api.deepseek.com", model: "deepseek-chat" },
} as const satisfies Record<string, CompatiblePreset>;

export interface CompatibleConfig {
  /** Registered name ("gemini", "deepseek", "openai-compatible"). */
  name: string;
  label: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  /** For tests. */
  fetch?: typeof fetch;
}

export type ChatStream =
  { ok: true; provider: string; model: string; chunks: AsyncIterable<string> } | AIFailure;

function failure(status: number, detail: string): AIFailure {
  if (status === 401 || status === 403) {
    return {
      ok: false,
      reason: "unavailable",
      message: "The AI service refused the API key. Check AI_API_KEY in the deployment settings.",
    };
  }
  if (status === 429) {
    return {
      ok: false,
      reason: "unavailable",
      message: "The AI service's rate limit was reached. Wait a minute and ask again.",
    };
  }
  if (status === 400 && /safety|blocked|policy/i.test(detail)) {
    return { ok: false, reason: "refused", message: "The AI service declined to answer this." };
  }
  return {
    ok: false,
    reason: "unavailable",
    message: `The AI service did not answer (${status || "no connection"}). Try again in a moment.`,
  };
}

/** Reads `data:` lines of a server-sent event stream as text deltas. */
async function* deltas(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data) as {
            choices?: { delta?: { content?: string | null } }[];
          };
          const text = parsed.choices?.[0]?.delta?.content;
          if (text) yield text;
        } catch {
          // A malformed event is skipped; the rest of the answer still arrives.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function createCompatibleChat(config: CompatibleConfig) {
  const doFetch = config.fetch ?? fetch;
  const url = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  return {
    async streamChat(input: {
      page: PageContext;
      messages: ChatMessage[];
      signal?: AbortSignal;
    }): Promise<ChatStream> {
      let response: Response;
      try {
        response = await doFetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.model,
            stream: true,
            temperature: 0.3,
            max_tokens: 4096,
            messages: [
              { role: "system", content: systemPrompt(input.page) },
              ...boundedConversation(input.messages),
            ],
          }),
          signal: input.signal,
        });
      } catch {
        return failure(0, "");
      }
      if (!response.ok || !response.body) {
        const detail = await response.text().catch(() => "");
        return failure(response.status, detail);
      }
      return {
        ok: true,
        provider: config.label,
        model: config.model,
        chunks: deltas(response.body),
      };
    },
  };
}
