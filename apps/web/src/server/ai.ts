import "server-only";

import { type AIProvider, createAIProvider } from "@medos/ai";

import { env } from "@/env";

/** The configured AI provider. With AI_PROVIDER=none (the default), no AI at all. */
export function getAIProvider(): AIProvider {
  return createAIProvider({
    provider: env.AI_PROVIDER,
    apiKey: env.AI_API_KEY,
    model: env.AI_MODEL,
    baseUrl: env.AI_BASE_URL,
  });
}

/** Whether AI features can run; pages pass this to the AI buttons. */
export function aiConfigured(): boolean {
  return getAIProvider().configured;
}
