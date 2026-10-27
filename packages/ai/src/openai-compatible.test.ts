import { describe, expect, it, vi } from "vitest";

import { systemPrompt } from "./chat";
import { createAIProvider } from "./provider";

/*
 * Gemini, DeepSeek and other OpenAI-compatible services: the request MedOS
 * sends, the streamed answer it reads, and how failures are explained.
 */

const page = {
  title: "Neutropenia — Study Guide",
  path: "/courses/pathophysiology/lectures/x/study-guide/y",
  text: "Neutropenia: ANC below 1500/μl.",
  selection: "ANC below 1500/μl",
};
const messages = [{ role: "user" as const, content: "What counts as severe?" }];

function streamOf(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(event));
      controller.close();
    },
  });
}

async function collect(chunks: AsyncIterable<string>) {
  let text = "";
  for await (const chunk of chunks) text += chunk;
  return text;
}

describe("an OpenAI-compatible provider", () => {
  it("sends the page and the conversation to the preset's address and streams the answer", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          streamOf([
            'data: {"choices":[{"delta":{"content":"Severe is "}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"below 500."}}]}\n',
            "\ndata: [DONE]\n\n",
          ]),
        ),
    );
    const provider = createAIProvider({ provider: "gemini", apiKey: "secret", fetch });
    expect(provider).toMatchObject({ name: "gemini", label: "Gemini", configured: true });

    const result = await provider.streamChat({ page, messages });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.model).toBe("gemini-2.5-flash");
    expect(await collect(result.chunks)).toBe("Severe is below 500.");

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer secret");
    const sent = JSON.parse(String(init.body));
    expect(sent).toMatchObject({ model: "gemini-2.5-flash", stream: true });
    expect(sent.messages[0]).toEqual({ role: "system", content: systemPrompt(page) });
    expect(sent.messages[1]).toEqual(messages[0]);
  });

  it("uses a configured model and address", async () => {
    const fetch = vi.fn(async () => new Response(streamOf(["data: [DONE]\n"])));
    const provider = createAIProvider({
      provider: "deepseek",
      apiKey: "k",
      model: "deepseek-reasoner",
      fetch,
    });
    await provider.streamChat({ page, messages });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect(JSON.parse(String(init.body)).model).toBe("deepseek-reasoner");
  });

  it("explains a refused key, a rate limit and a lost connection", async () => {
    const answer = (response: Response | Error) =>
      createAIProvider({
        provider: "gemini",
        apiKey: "k",
        fetch: async () => {
          if (response instanceof Error) throw response;
          return response;
        },
      }).streamChat({ page, messages });

    expect(await answer(new Response("no", { status: 401 }))).toMatchObject({
      ok: false,
      message: expect.stringContaining("API key"),
    });
    expect(await answer(new Response("slow down", { status: 429 }))).toMatchObject({
      ok: false,
      message: expect.stringContaining("rate limit"),
    });
    expect(await answer(new Error("offline"))).toMatchObject({ ok: false, reason: "unavailable" });
  });

  it("puts the selected passage and the page text in the instructions", () => {
    const prompt = systemPrompt(page);
    expect(prompt).toContain("Page title: Neutropenia — Study Guide");
    expect(prompt).toContain("selected this passage");
    expect(prompt).toContain("ANC below 1500/μl");
    expect(systemPrompt({ ...page, selection: null })).not.toContain("selected this passage");
  });
});
