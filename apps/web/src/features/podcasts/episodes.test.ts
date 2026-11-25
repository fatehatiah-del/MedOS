import { describe, expect, it } from "vitest";

import { EPISODE_SOURCE_LIMIT, pairTopics, parseDialogue, plainText } from "./episodes";

describe("lecture podcasts", () => {
  it("pairs consecutive topics and keeps the final unpaired topic", () => {
    const topics = ["Mechanism", "Presentation", "Complications"].map((label) => ({
      label,
      text: "Notes on " + label,
    }));
    const episodes = pairTopics(topics);
    expect(episodes.map(({ labels }) => labels)).toEqual([
      ["Mechanism", "Presentation"],
      ["Complications"],
    ]);
    expect(episodes[0]?.text).toContain("Notes on Presentation");
  });

  it("retains the end of long topics while keeping requests within the source limit", () => {
    const episodes = pairTopics([
      { label: "Mechanism", text: "example ".repeat(6000) + "Final detail." },
    ]);
    expect(episodes.length).toBeGreaterThan(1);
    expect(episodes.at(-1)?.text).toContain("Final detail.");
    expect(episodes.every(({ text }) => text.length <= EPISODE_SOURCE_LIMIT)).toBe(true);
  });

  it("accepts alternating dialogue and rejects repeated hosts and empty turns", () => {
    const dialogue = "A: What changes?\nB: Pressure rises.\nA: What follows?\nB: Flow drops.";
    expect(parseDialogue(dialogue)?.map(({ host }) => host)).toEqual(["A", "B", "A", "B"]);
    expect(parseDialogue(dialogue.replace("B: Pressure rises.", "A: Pressure rises."))).toBeNull();
    expect(parseDialogue(dialogue.replace("Pressure rises.", "  "))).toBeNull();
  });
});

describe("plainText", () => {
  it("removes voice cues so they are never shown or read by device voices", () => {
    expect(plainText("[curious] Wait, so ferritin falls first?")).toBe(
      "Wait, so ferritin falls first?",
    );
    expect(plainText("Right. [laughs] That one catches everyone.")).toBe(
      "Right. That one catches everyone.",
    );
    expect(plainText("Iron [Fe] stays as written.")).toBe("Iron [Fe] stays as written.");
  });
});
