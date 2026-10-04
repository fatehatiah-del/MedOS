/*
 * The AI provider interface (specification §30). MedOS works fully without
 * AI: the default provider is "none", which answers every request with "not
 * configured" and makes no network call of any kind. A real provider
 * implements this interface and is registered in `createAIProvider`; feature
 * pages call features by name and never depend on which provider runs.
 *
 * Anything a provider produces carries its provenance (§31), so AI content
 * can always be shown as AI-generated and kept apart from source material.
 */

/** What a piece of AI output was made from. */
export interface SourceRef {
  kind: "lecture" | "resource" | "section" | "question" | "flashcard";
  id: string;
  label?: string;
}

/** Where AI output came from. Always attached; never shown as source material. */
export interface Provenance {
  origin: "ai";
  provider: string;
  model: string;
  /** ISO timestamp. */
  generatedAt: string;
  sources: SourceRef[];
}

export type AIFailure = {
  ok: false;
  reason: "not-configured" | "unavailable" | "refused";
  message: string;
};

export type AIResult<T> = { ok: true; value: T; provenance: Provenance } | AIFailure;

/** A lecture's own material, as plain text, for a provider to work from. */
export interface LectureContext {
  lectureId: string;
  courseName: string;
  lectureTitle: string;
  /** The lecture's source text (Study Guide, slides), never AI output. */
  text: string;
}

export interface QuestionContext {
  stem: string;
  options: string[];
  correctIndex: number | null;
  /** The source's own explanation, when it gives one. */
  sourceExplanation: string | null;
}

export interface AIProvider {
  /** Registered name, e.g. "none". */
  readonly name: string;
  /** False for "none": the interface shows AI features as unavailable. */
  readonly configured: boolean;

  summarizeLecture(input: {
    lecture: LectureContext;
    format: "summary" | "study-guide";
  }): Promise<AIResult<{ markdown: string }>>;

  generateFlashcards(input: {
    lecture: LectureContext;
    count: number;
  }): Promise<AIResult<{ cards: { front: string; back: string }[] }>>;

  generateMCQs(input: {
    lecture: LectureContext;
    count: number;
    style: "usmle" | "standard";
  }): Promise<
    AIResult<{
      questions: { stem: string; options: string[]; answerIndex: number; explanation: string }[];
    }>
  >;

  explainQuestion(input: {
    question: QuestionContext;
    selectedIndex: number | null;
  }): Promise<AIResult<{ explanation: string }>>;

  analyzeWeaknesses(input: {
    weaknesses: { label: string; evidence: string[] }[];
  }): Promise<AIResult<{ advice: string }>>;

  answerFromLecture(input: {
    lecture: LectureContext;
    question: string;
  }): Promise<AIResult<{ answer: string }>>;
}

export const NOT_CONFIGURED_MESSAGE =
  "AI provider not configured. MedOS does not generate content without one; your own material is unaffected.";

const notConfigured = async (): Promise<AIFailure> => ({
  ok: false,
  reason: "not-configured",
  message: NOT_CONFIGURED_MESSAGE,
});

/**
 * The default provider: no AI. Every capability reports "not configured".
 * It holds no keys, makes no requests and generates nothing.
 */
export const noneProvider: AIProvider = Object.freeze({
  name: "none",
  configured: false,
  summarizeLecture: notConfigured,
  generateFlashcards: notConfigured,
  generateMCQs: notConfigured,
  explainQuestion: notConfigured,
  analyzeWeaknesses: notConfigured,
  answerFromLecture: notConfigured,
});

/** Providers MedOS knows. A new provider adds its name here and its case below. */
export const AI_PROVIDER_NAMES = ["none"] as const;
export type AIProviderName = (typeof AI_PROVIDER_NAMES)[number];

export function createAIProvider(name: AIProviderName): AIProvider {
  switch (name) {
    case "none":
      return noneProvider;
  }
}

/**
 * The AI features the interface shows, each tied to one capability. Pages
 * name a feature; which provider answers is decided on the server.
 */
export const AI_FEATURES = {
  "ask-medos": {
    label: "Ask MedOS",
    capability: "answerFromLecture",
    description: "Ask a question and get an answer drawn from this lecture's own material.",
  },
  "explain-this": {
    label: "Explain this",
    capability: "explainQuestion",
    description: "An explanation of this question beyond the source's own.",
  },
  "generate-flashcards": {
    label: "Generate flashcards",
    capability: "generateFlashcards",
    description: "Candidate cards from the lecture, for you to edit before saving.",
  },
  "generate-usmle-questions": {
    label: "Generate USMLE questions",
    capability: "generateMCQs",
    description: "New vignette-style questions from the lecture, labelled as AI-generated.",
  },
  "generate-study-guide": {
    label: "Generate Study Guide",
    capability: "summarizeLecture",
    description: "A Study Guide drafted from the original lecture (planned for a later version).",
  },
} as const satisfies Record<
  string,
  { label: string; capability: keyof AIProvider; description: string }
>;

export type AIFeature = keyof typeof AI_FEATURES;
export const AI_FEATURE_IDS = Object.keys(AI_FEATURES) as AIFeature[];
