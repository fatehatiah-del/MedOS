import { AI_PROVIDER_NAMES } from "@medos/ai";
import { z } from "zod";

/**
 * Server-side environment configuration.
 *
 * Every variable the application reads is declared and validated here, so a
 * misconfigured deployment fails loudly at startup instead of misbehaving
 * later. Nothing here is specific to a hosting provider.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** AI is optional. "none" is the only provider until one is implemented (see @medos/ai). */
  AI_PROVIDER: z.enum(AI_PROVIDER_NAMES).default("none"),
  /** Public base URL of the deployment. */
  APP_URL: z.url().optional(),
  /**
   * Development aid: give an account with no weeks a set of placeholder weeks
   * and lectures. Leave it off wherever real material will be imported.
   */
  /**
   * Where MedOS keeps its copies of originals and extracted images, shared
   * with MedOS Sync. Defaults to `.medos/objects` in the repository.
   */
  MEDOS_STORAGE_DIR: z.string().optional(),
  DEV_FIXTURE_LECTURES: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  // Treat empty strings ("AI_PROVIDER=") as unset so defaults apply.
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ""),
  );
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid MedOS environment configuration:\n${details}\nSee .env.example for the supported variables.`,
    );
  }
  return result.data;
}

export const env = parseEnv(process.env);
