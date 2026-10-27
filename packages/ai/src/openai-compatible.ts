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
  /**
   * Tried in order when the model is retired, overloaded or does not answer.
   * Google retires and overloads Gemini models often.
   */
  fallbacks: readonly string[];
}

export const COMPATIBLE_PRESETS = {
  gemini: {
    label: "Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-3-flash-preview",
    fallbacks: ["gemini-flash-latest", "gemini-3.1-flash-lite"],
  },
  deepseek: {
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
    fallbacks: [],
  },
} as const satisfies Record<string, CompatiblePreset>;

/** How long to wait for a model to start answering before trying the next. */
export const FIRST_BYTE_TIMEOUT_MS = 25_000;

/** Failures worth trying another model for: retired, overloaded, broken, or silent. */
const RETRYABLE = new Set([0, 404, 500, 502, 503, 504]);

export interface CompatibleConfig {
  /** Registered name ("gemini", "deepseek", "openai-compatible"). */
  name: string;
  label: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  /** Other models to try, in order, when `model` cannot answer. */
  fallbackModels?: readonly string[];
  /** For tests. */
  fetch?: typeof fetch;
  firstByteTimeoutMs?: number;
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

  const models = [config.model, ...(config.fallbackModels ?? [])].filter(
    (model, index, all) => all.indexOf(model) === index,
  );
  const timeout = config.firstByteTimeoutMs ?? FIRST_BYTE_TIMEOUT_MS;

  /** One model's attempt: the response once it starts, or why it did not. */
  async function attempt(
    model: string,
    input: { page: PageContext; messages: ChatMessage[]; signal?: AbortSignal },
  ): Promise<{ response: Response } | { status: number; detail: string }> {
    const controller = new AbortController();
    const stop = () => controller.abort();
    input.signal?.addEventListener("abort", stop);
    // Only waiting for the answer to start is limited; a long answer may stream for longer.
    const timer = setTimeout(stop, timeout);
    try {
      const response = await doFetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model,
          stream: true,
          temperature: 0.3,
          max_tokens: 4096,
          messages: [
            { role: "system", content: systemPrompt(input.page) },
            ...boundedConversation(input.messages),
          ],
        }),
        signal: controller.signal,
      });
      if (response.ok && response.body) return { response };
      return { status: response.status, detail: await response.text().catch(() => "") };
    } catch {
      return { status: 0, detail: "" };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async streamChat(input: {
      page: PageContext;
      messages: ChatMessage[];
      signal?: AbortSignal;
    }): Promise<ChatStream> {
      let last = { status: 0, detail: "" };
      for (const model of models) {
        const result = await attempt(model, input);
        if ("response" in result) {
          return {
            ok: true,
            provider: config.label,
            model,
            chunks: deltas(result.response.body!),
          };
        }
        last = result;
        if (input.signal?.aborted || !RETRYABLE.has(result.status)) break;
      }
      return failure(last.status, last.detail);
    },
  };
}
