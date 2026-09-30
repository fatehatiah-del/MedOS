import { describe, expect, it } from "vitest";

import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("defaults to no AI provider", () => {
    expect(parseEnv({}).AI_PROVIDER).toBe("none");
  });

  it("treats empty values as unset", () => {
    expect(parseEnv({ AI_PROVIDER: "", APP_URL: "" })).toMatchObject({ AI_PROVIDER: "none" });
  });

  it("accepts a valid configuration", () => {
    const env = parseEnv({
      NODE_ENV: "production",
      AI_PROVIDER: "none",
      APP_URL: "https://medos.example",
    });
    expect(env).toEqual({
      NODE_ENV: "production",
      AI_PROVIDER: "none",
      APP_URL: "https://medos.example",
    });
  });

  it("rejects an unsupported AI provider with an actionable message", () => {
    expect(() => parseEnv({ AI_PROVIDER: "gpt" })).toThrowError(/AI_PROVIDER/);
    expect(() => parseEnv({ AI_PROVIDER: "gpt" })).toThrowError(/\.env\.example/);
  });

  it("rejects a malformed APP_URL", () => {
    expect(() => parseEnv({ APP_URL: "not a url" })).toThrowError(/APP_URL/);
  });
});
