import type { ResourceSummary } from "@medos/database";
import { describe, expect, it } from "vitest";

import { contentDetail, materialState } from "./processing";

function resource(overrides: Partial<ResourceSummary> = {}): ResourceSummary {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    lectureId: "00000000-0000-4000-8000-000000000002",
    kind: "mcq",
    originalFilename: "Quiz.html",
    mimeType: "text/html",
    sizeBytes: 100,
    status: "stored",
    processingError: null,
    createdAt: new Date("2026-10-01T09:00:00Z"),
    content: null,
    ...overrides,
  };
}

const parsed = (
  format: "study-guide" | "mcq-set" | "question-bank" | "pdf",
  stats: Record<string, number>,
  extra = {},
) =>
  resource({
    status: "parsed",
    content: { format, stats, issueCount: 0, current: true, extractedAt: new Date(), ...extra },
  });

describe("material state", () => {
  it("says a parsed material is ready and what it contains", () => {
    expect(materialState(parsed("mcq-set", { questions: 40, unresolved: 0 }))).toEqual({
      tone: "success",
      label: "Ready",
      detail: "40 questions",
    });
    expect(
      materialState(parsed("study-guide", { sections: 23, tables: 9, figures: 13 })).detail,
    ).toBe("23 sections · 9 tables · 13 figures");
    expect(materialState(parsed("question-bank", { items: 40, paired: 38 })).detail).toBe(
      "40 questions · 38 with answers",
    );
    expect(materialState(parsed("pdf", { pages: 1 })).detail).toBe("1 page");
  });

  it("mentions questions without a stated answer and parser notes", () => {
    expect(
      contentDetail({
        format: "mcq-set",
        stats: { questions: 3, unresolved: 1 },
        issueCount: 2,
        current: true,
        extractedAt: new Date(),
      }),
    ).toBe("3 questions · 1 without a stated answer · 2 notes");
  });

  it("shows the user's actionable message when a file could not be read", () => {
    const state = materialState(
      resource({
        status: "failed",
        processingError: "This PDF is password-protected, so MedOS cannot read it.",
      }),
    );
    expect(state).toMatchObject({ tone: "danger", label: "Could not be read" });
    expect(state.detail).toContain("password-protected");
  });

  it("says when a format is not read yet", () => {
    expect(
      materialState(
        resource({
          status: "unsupported",
          processingError: "PowerPoint files are kept as originals.",
        }),
      ),
    ).toMatchObject({ label: "Not read yet", detail: "PowerPoint files are kept as originals." });
  });

  it("says when the source changed since it was read", () => {
    expect(materialState(parsed("pdf", { pages: 2 }, { current: false })).label).toBe(
      "Source changed",
    );
    expect(
      materialState(
        resource({
          status: "stored",
          content: {
            format: "pdf",
            stats: {},
            issueCount: 0,
            current: false,
            extractedAt: new Date(),
          },
        }),
      ).label,
    ).toBe("Source changed");
  });

  it("says when a material has been imported but not read yet", () => {
    expect(materialState(resource())).toMatchObject({ tone: "neutral", label: "Imported" });
  });
});
