import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { AwsClient } from "aws4fetch";

import { ObjectMissingError, type ObjectStore } from "./index";

/*
 * An S3-compatible object store, for hosted deployments where the server has
 * no lasting disk: AWS S3, Cloudflare R2, Supabase Storage, MinIO and others
 * speak the same protocol. Requests are signed with AWS Signature V4 and sent
 * with fetch, so nothing here depends on one provider's SDK.
 *
 * Objects keep MedOS's content keys ("sha256/<hash>") as their names, in a
 * private bucket. The bucket is never exposed: the web app reads objects on
 * the server and serves them only to their owner.
 */

export interface S3StoreConfig {
  /** e.g. https://s3.eu-central-1.amazonaws.com, https://<account>.r2.cloudflarestorage.com */
  endpoint: string;
  bucket: string;
  /** e.g. eu-central-1; "auto" for R2. */
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

const KEY = /^sha256\/[0-9a-f]{64}$/;

function checkKey(key: string): void {
  if (!KEY.test(key)) throw new Error(`Invalid storage key: ${key}`);
}

const sha256Key = (bytes: Uint8Array) =>
  `sha256/${createHash("sha256").update(bytes).digest("hex")}`;

export class S3ObjectStore implements ObjectStore {
  private readonly client: AwsClient;
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly config: S3StoreConfig,
    fetchImpl: typeof fetch = fetch,
  ) {
    this.client = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      service: "s3",
      region: config.region,
    });
    // Path-style addressing (endpoint/bucket/key) works with every S3-compatible service.
    this.base = `${config.endpoint.replace(/\/+$/, "")}/${encodeURIComponent(config.bucket)}`;
    this.fetchImpl = fetchImpl;
  }

  describe(): string {
    return `s3://${this.config.bucket} at ${new URL(this.config.endpoint).host}`;
  }

  private async send(method: "HEAD" | "GET" | "PUT", key: string, body?: Uint8Array) {
    checkKey(key);
    const request = await this.client.sign(`${this.base}/${key}`, {
      method,
      ...(body
        ? {
            body: body as Uint8Array<ArrayBuffer>,
            headers: {
              "Content-Type": "application/octet-stream",
              // The key is the SHA-256 of the body, so the signature covers the exact bytes.
              "X-Amz-Content-Sha256": key.slice("sha256/".length),
            },
          }
        : {}),
    });
    return this.fetchImpl(request);
  }

  private async fail(response: Response, action: string): Promise<never> {
    // The body may name the bucket or the request; report only the status.
    await response.body?.cancel();
    throw new Error(`Object storage could not ${action} (HTTP ${response.status}).`);
  }

  async has(key: string): Promise<boolean> {
    const response = await this.send("HEAD", key);
    if (response.ok) return true;
    if (response.status === 404) return false;
    return this.fail(response, "check an object");
  }

  async put(key: string, sourcePath: string): Promise<"stored" | "existing"> {
    return this.putBytes(key, new Uint8Array(await readFile(sourcePath)));
  }

  async putBytes(key: string, bytes: Uint8Array): Promise<"stored" | "existing"> {
    checkKey(key);
    // Content addressing is a promise: the bytes must be what the key says.
    if (sha256Key(bytes) !== key) throw new Error(`Content does not match its storage key ${key}.`);
    if (await this.has(key)) return "existing";
    const response = await this.send("PUT", key, bytes);
    if (!response.ok) return this.fail(response, "store an object");
    await response.body?.cancel();
    return "stored";
  }

  async read(key: string): Promise<Uint8Array> {
    const response = await this.send("GET", key);
    if (response.status === 404) {
      await response.body?.cancel();
      throw new ObjectMissingError(key);
    }
    if (!response.ok) return this.fail(response, "read an object");
    return new Uint8Array(await response.arrayBuffer());
  }
}
