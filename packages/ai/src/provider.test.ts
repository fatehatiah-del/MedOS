import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AI_FEATURES,
  AI_FEATURE_IDS,
  AI_PROVIDER_NAMES,
  NOT_CONFIGURED_MESSAGE,
  createAIProvider,
  noneProvider,
} from "./provider";

/* With AI_PROVIDER=none, nothing is generated and nothing leaves the machine. */

const lecture = {
  lectureId: "l",
  courseName: "Pharmacology I",
  lectureTitle: "Receptors",
  text: "x",
};
const calls: (() => Promise<unknown>)[] = [
  () => noneProvider.summarizeLecture({ lecture, format: "summary" }),
  () => noneProvider.generateFlashcards({ lecture, count: 5 }),
  () => noneProvider.generateMCQs({ lecture, count: 5, style: "usmle" }),
  () =>
    noneProvider.explainQuestion({
      question: { stem: "?", options: ["a", "b"], correctIndex: 1, sourceExplanation: null },
      selectedIndex: 0,
    }),
  () => noneProvider.analyzeWeaknesses({ weaknesses: [] }),
  () => noneProvider.answerFromLecture({ lecture, question: "Why?" }),
  () =>
    noneProvider.streamChat({
      page: { title: "t", path: "/", text: "x", selection: null },
      messages: [{ role: "user", content: "?" }],
    }),
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the none provider", () => {
  it("is the default and is not configured", () => {
    expect(AI_PROVIDER_NAMES[0]).toBe("none");
    expect(createAIProvider("none")).toBe(noneProvider);
    // A provider without its key is no AI at all.
    expect(createAIProvider({ provider: "gemini" })).toBe(noneProvider);
    expect(createAIProvider({ provider: "openai-compatible", apiKey: "k" })).toBe(noneProvider);
    expect(noneProvider).toMatchObject({ name: "none", configured: false });
  });

  it("answers every capability with not-configured, generating nothing", async () => {
    for (const call of calls) {
      expect(await call()).toEqual({
        ok: false,
        reason: "not-configured",
        message: NOT_CONFIGURED_MESSAGE,
      });
    }
  });

  it("makes no network request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    for (const call of calls) await call();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("cannot be altered at runtime", () => {
    expect(Object.isFrozen(noneProvider)).toBe(true);
  });
});

describe("AI features", () => {
  it("each names a real capability of the interface", () => {
    for (const id of AI_FEATURE_IDS) {
      expect(typeof noneProvider[AI_FEATURES[id].capability]).toBe("function");
    }
    expect(AI_FEATURE_IDS.map((id) => AI_FEATURES[id].label)).toEqual([
      "Ask MedOS",
      "Explain this",
      "Generate flashcards",
      "Generate USMLE questions",
      "Generate Study Guide",
    ]);
  });
});
