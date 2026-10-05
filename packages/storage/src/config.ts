import { LocalObjectStore, type ObjectStore } from "./index";
import { S3ObjectStore, type S3StoreConfig } from "./s3";

/*
 * Which object store MedOS uses, from the environment. The web app and MedOS
 * Sync read the same variables, so a sync run on the user's computer writes
 * to exactly the store the deployed app reads.
 *
 *   STORAGE_PROVIDER=local (default)  a folder: MEDOS_STORAGE_DIR, or the caller's default
 *   STORAGE_PROVIDER=s3               an S3-compatible bucket: STORAGE_BUCKET,
 *                                     STORAGE_ENDPOINT, STORAGE_REGION,
 *                                     STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY
 */

export const STORAGE_PROVIDERS = ["local", "s3"] as const;
export type StorageProvider = (typeof STORAGE_PROVIDERS)[number];

export type StorageConfig =
  { provider: "local"; directory: string | null } | ({ provider: "s3" } & S3StoreConfig);

export class StorageConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid object storage configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "StorageConfigError";
  }
}

type Source = Record<string, string | undefined>;

const read = (source: Source, name: string) => {
  const value = source[name]?.trim();
  return value ? value : undefined;
};

/** The storage configuration the environment describes. Throws StorageConfigError when it is unusable. */
export function storageConfigFromEnv(source: Source): StorageConfig {
  const provider = read(source, "STORAGE_PROVIDER") ?? "local";
  if (provider === "local") {
    return { provider: "local", directory: read(source, "MEDOS_STORAGE_DIR") ?? null };
  }
  if (provider !== "s3") {
    throw new StorageConfigError([
      `STORAGE_PROVIDER must be one of: ${STORAGE_PROVIDERS.join(", ")} (got "${provider}").`,
    ]);
  }

  const problems: string[] = [];
  const required = (name: string) => {
    const value = read(source, name);
    if (!value) problems.push(`${name} is required when STORAGE_PROVIDER=s3.`);
    return value ?? "";
  };
  const config = {
    provider: "s3" as const,
    bucket: required("STORAGE_BUCKET"),
    endpoint: required("STORAGE_ENDPOINT"),
    region: read(source, "STORAGE_REGION") ?? "auto",
    accessKeyId: required("STORAGE_ACCESS_KEY_ID"),
    secretAccessKey: required("STORAGE_SECRET_ACCESS_KEY"),
  };
  if (config.endpoint && !URL.canParse(config.endpoint)) {
    problems.push(
      "STORAGE_ENDPOINT must be a full URL such as https://s3.eu-central-1.amazonaws.com.",
    );
  } else if (
    config.endpoint &&
    new URL(config.endpoint).protocol !== "https:" &&
    !isLocalHost(new URL(config.endpoint).hostname)
  ) {
    problems.push("STORAGE_ENDPOINT must use https:// (http is accepted only for a local server).");
  }
  if (problems.length > 0) throw new StorageConfigError(problems);
  return config;
}

export function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * The store a configuration describes. Each caller resolves a local folder its
 * own way (relative paths, its default), so it passes that resolution in.
 */
export function createObjectStore(
  config: StorageConfig,
  localDirectory: (configured: string | null) => string,
): ObjectStore {
  if (config.provider === "s3") return new S3ObjectStore(config);
  return new LocalObjectStore(localDirectory(config.directory));
}
