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
  /** AI is optional. "none" is the only provider until one is implemented. */
  AI_PROVIDER: z.enum(["none"]).default("none"),
  /** Public base URL of the deployment. */
  APP_URL: z.url().optional(),
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
