import "server-only";

import { type AIProvider, createAIProvider } from "@medos/ai";

import { env } from "@/env";

/** The configured AI provider. With AI_PROVIDER=none (the default), no AI at all. */
export function getAIProvider(): AIProvider {
  return createAIProvider(env.AI_PROVIDER);
}

/** Whether AI features can run; pages pass this to the AI buttons. */
export function aiConfigured(): boolean {
  return getAIProvider().configured;
}
