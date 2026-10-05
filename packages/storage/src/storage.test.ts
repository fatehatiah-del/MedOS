import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { type IncomingMessage, type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  LocalObjectStore,
  ObjectMissingError,
  S3ObjectStore,
  StorageConfigError,
  contentKey,
  createObjectStore,
  storageConfigFromEnv,
} from "./index";

/*
 * Object storage: the local folder store, the S3-compatible store (against a
 * small in-process S3 stand-in that checks every request is signed and its
 * body matches its declared hash), and the configuration both are chosen by.
 */

const sha256 = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const bytesOf = (text: string) => new TextEncoder().encode(text);
const keyOf = (text: string) => contentKey(sha256(text));

/** An S3 stand-in: path-style PUT, GET and HEAD, rejecting anything unsigned or tampered with. */
function fakeS3() {
  const objects = new Map<string, Buffer>();
  const requests: { method: string; url: string; authorization: string }[] = [];
  const body = (request: IncomingMessage) =>
    new Promise<Buffer>((resolve) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => resolve(Buffer.concat(chunks)));
    });
  const server = createServer(async (request, response) => {
    const authorization = request.headers.authorization ?? "";
    requests.push({ method: request.method ?? "", url: request.url ?? "", authorization });
    if (
      !/^AWS4-HMAC-SHA256 Credential=TESTKEY\/\d{8}\/eu-test-1\/s3\/aws4_request, SignedHeaders=.*x-amz-content-sha256.*, Signature=[0-9a-f]{64}$/.test(
        authorization,
      ) ||
      !request.headers["x-amz-date"]
    ) {
      response.writeHead(403).end("<Error>SignatureDoesNotMatch in bucket medos-test</Error>");
      return;
    }
    const name = request.url ?? "";
    if (request.method === "PUT") {
      const data = await body(request);
      if (request.headers["x-amz-content-sha256"] !== sha256(data)) {
        response.writeHead(400).end("<Error>XAmzContentSHA256Mismatch</Error>");
        return;
      }
      objects.set(name, data);
      response.writeHead(200).end();
      return;
    }
    const stored = objects.get(name);
    if (!stored) {
      response
        .writeHead(404)
        .end(request.method === "HEAD" ? undefined : "<Error>NoSuchKey</Error>");
      return;
    }
    response.writeHead(200, { "Content-Length": stored.length });
    response.end(request.method === "HEAD" ? undefined : stored);
  });
  return { server, objects, requests };
}

describe("LocalObjectStore", () => {
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), "medos-store-"));
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("stores content once, under its hash, and reads it back", async () => {
    const store = new LocalObjectStore(root);
    const key = keyOf("lecture");
    expect(await store.has(key)).toBe(false);
    expect(await store.putBytes(key, bytesOf("lecture"))).toBe("stored");
    expect(await store.putBytes(key, bytesOf("lecture"))).toBe("existing");
    expect(new TextDecoder().decode(await store.read(key))).toBe("lecture");
    await expect(store.read(keyOf("missing"))).rejects.toBeInstanceOf(ObjectMissingError);
    await expect(store.putBytes(key, bytesOf("other"))).rejects.toThrow(/does not match/);
  });
});

describe("S3ObjectStore", () => {
  const s3 = fakeS3();
  let store: S3ObjectStore;
  let source: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => s3.server.listen(0, "127.0.0.1", resolve));
    const { port } = s3.server.address() as AddressInfo;
    store = new S3ObjectStore({
      endpoint: `http://127.0.0.1:${port}/`,
      bucket: "medos-test",
      region: "eu-test-1",
      accessKeyId: "TESTKEY",
      secretAccessKey: "test-secret",
    });
    source = path.join(mkdtempSync(path.join(tmpdir(), "medos-s3-")), "Lecture.pdf");
    writeFileSync(source, "%PDF-1.7 synthetic");
  });
  afterAll(async () => {
    await new Promise((resolve) => (s3.server as Server).close(resolve));
    rmSync(path.dirname(source), { recursive: true, force: true });
  });

  it("puts signed objects under their content key, once, and reads them back", async () => {
    const key = keyOf("%PDF-1.7 synthetic");
    expect(await store.has(key)).toBe(false);
    expect(await store.put(key, source)).toBe("stored");
    expect(await store.put(key, source)).toBe("existing");
    expect(s3.objects.has(`/medos-test/${key}`)).toBe(true);
    expect(new TextDecoder().decode(await store.read(key))).toBe("%PDF-1.7 synthetic");
    expect(s3.requests.filter((request) => request.method === "PUT")).toHaveLength(1);
    expect(
      s3.requests.every((request) => request.authorization.startsWith("AWS4-HMAC-SHA256")),
    ).toBe(true);
  });

  it("reports a missing object as missing", async () => {
    await expect(store.read(keyOf("never stored"))).rejects.toBeInstanceOf(ObjectMissingError);
  });

  it("refuses bytes that are not what their key says, and keys that are not content keys", async () => {
    await expect(store.putBytes(keyOf("one"), bytesOf("two"))).rejects.toThrow(/does not match/);
    await expect(store.has("../secrets")).rejects.toThrow(/Invalid storage key/);
  });

  it("fails plainly, without the provider's message, when the service refuses", async () => {
    const refused = new S3ObjectStore({
      endpoint: (store as unknown as { config: { endpoint: string } }).config.endpoint,
      bucket: "medos-test",
      region: "eu-test-1",
      accessKeyId: "WRONG",
      secretAccessKey: "test-secret",
    });
    const error = await refused.read(keyOf("x")).catch((caught: Error) => caught);
    expect(String(error)).toBe("Error: Object storage could not read an object (HTTP 403).");
  });

  it("describes itself without its keys", () => {
    expect(store.describe()).toMatch(/^s3:\/\/medos-test at 127\.0\.0\.1:\d+$/);
  });
});

describe("storage configuration", () => {
  it("defaults to a local folder", () => {
    expect(storageConfigFromEnv({})).toEqual({ provider: "local", directory: null });
    expect(storageConfigFromEnv({ MEDOS_STORAGE_DIR: " D:/medos " })).toEqual({
      provider: "local",
      directory: "D:/medos",
    });
  });

  it("reads an S3-compatible bucket, with the region defaulting to auto", () => {
    expect(
      storageConfigFromEnv({
        STORAGE_PROVIDER: "s3",
        STORAGE_BUCKET: "medos",
        STORAGE_ENDPOINT: "https://example.r2.cloudflarestorage.com",
        STORAGE_ACCESS_KEY_ID: "id",
        STORAGE_SECRET_ACCESS_KEY: "secret",
      }),
    ).toMatchObject({ provider: "s3", bucket: "medos", region: "auto" });
  });

  it("lists everything missing at once, and refuses plain http to a remote host", () => {
    const error = (() => {
      try {
        storageConfigFromEnv({ STORAGE_PROVIDER: "s3", STORAGE_ENDPOINT: "http://s3.example.com" });
      } catch (caught) {
        return caught as StorageConfigError;
      }
      throw new Error("expected an error");
    })();
    expect(error).toBeInstanceOf(StorageConfigError);
    expect(error.problems).toEqual([
      "STORAGE_BUCKET is required when STORAGE_PROVIDER=s3.",
      "STORAGE_ACCESS_KEY_ID is required when STORAGE_PROVIDER=s3.",
      "STORAGE_SECRET_ACCESS_KEY is required when STORAGE_PROVIDER=s3.",
      "STORAGE_ENDPOINT must use https:// (http is accepted only for a local server).",
    ]);
    expect(() => storageConfigFromEnv({ STORAGE_PROVIDER: "ftp" })).toThrow(/must be one of/);
  });

  it("creates the store the configuration names", () => {
    expect(
      createObjectStore({ provider: "local", directory: null }, () => "/data/objects"),
    ).toBeInstanceOf(LocalObjectStore);
    expect(
      createObjectStore(
        {
          provider: "s3",
          bucket: "b",
          endpoint: "https://s3.example.com",
          region: "auto",
          accessKeyId: "id",
          secretAccessKey: "secret",
        },
        () => "/unused",
      ),
    ).toBeInstanceOf(S3ObjectStore);
  });
});
