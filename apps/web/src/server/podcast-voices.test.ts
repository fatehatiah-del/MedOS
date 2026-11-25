// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-for-podcast-signatures");

const { audioKey, dialogueRequests, signTurns, verifyTurns } = await import("./podcast-voices");

const turns = [
  { host: "A" as const, text: "What does ferritin tell us?" },
  { host: "B" as const, text: "It reflects the iron your body has stored." },
  { host: "A" as const, text: "So in iron deficiency it falls?" },
  { host: "B" as const, text: "Usually, yes, once the stores are depleted." },
];

describe("podcast voices", () => {
  it("only accepts dialogues this server signed", () => {
    const signature = signTurns(turns)!;
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyTurns(turns, signature)).toBe(true);
    const edited = turns.map((turn, index) => (index ? turn : { ...turn, text: "Anything else." }));
    expect(verifyTurns(edited, signature)).toBe(false);
    expect(verifyTurns(turns, "0".repeat(64))).toBe(false);
  });

  it("groups consecutive turns under the request budget, keeping order", () => {
    const long = Array.from({ length: 6 }, (_, index) => ({
      host: index % 2 ? ("B" as const) : ("A" as const),
      text: "x".repeat(700),
    }));
    const groups = dialogueRequests(long, 1500);
    expect(groups.map((group) => group.length)).toEqual([2, 2, 2]);
    expect(groups.flat()).toEqual(long);
    expect(dialogueRequests(turns)).toHaveLength(1);
  });

  it("stores the same dialogue under the same key", () => {
    expect(audioKey(turns)).toBe(audioKey([...turns]));
    expect(audioKey(turns)).not.toBe(audioKey(turns.slice(0, 3)));
    expect(audioKey(turns)).toMatch(/^podcasts\/[0-9a-f]{2}\/[0-9a-f]{64}\.mp3$/);
  });
});
