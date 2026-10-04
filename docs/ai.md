# AI-ready interfaces

MedOS works completely without AI (specification §30–31, BUILD_PLAN Phase 19). The default and,
for now, only provider is `none`: it answers every request with "not configured" and makes no
network request of any kind. No medical content is ever generated without a configured provider.

## Where AI features appear

Each feature is shown where it would be used, marked **Not configured**. It stays focusable, so its
explanation can be read with a screen reader, and pressing it only explains why it is unavailable.

| Feature                  | Where                              | Capability           |
| ------------------------ | ---------------------------------- | -------------------- |
| Ask MedOS                | Lecture page, **AI assistance**    | `answerFromLecture`  |
| Generate Study Guide     | Lecture page, **AI assistance**    | `summarizeLecture`   |
| Explain this             | MCQ feedback (Learn mode, results) | `explainQuestion`    |
| Generate USMLE questions | Quiz page, under **Practise**      | `generateMCQs`       |
| Generate flashcards      | Deck page, under **Add a card**    | `generateFlashcards` |

Settings shows the provider (`AI_PROVIDER`) and the list of features. (`analyzeWeaknesses` is part
of the interface but has no control yet.)

## The interface

`packages/ai/src/provider.ts`:

- `AIProvider`: `summarizeLecture`, `generateFlashcards`, `generateMCQs`, `explainQuestion`,
  `analyzeWeaknesses`, `answerFromLecture`. Each takes the lecture's own source text and returns
  either a value **with its provenance** (provider, model, time, the sources it was made from) or a
  failure (`not-configured`, `unavailable`, `refused`).
- `noneProvider`: frozen; every capability returns `not-configured`.
- `createAIProvider(name)` and `AI_PROVIDER_NAMES`: the registry. `AI_PROVIDER` in the environment
  only accepts names listed here, so a typo fails at startup.
- `AI_FEATURES`: the five features above, each naming one capability.

Pages never call a provider. They render `<AIAction feature="…" configured={aiConfigured()} …/>`
(`apps/web/src/features/ai/ai-action.tsx`), and the one Server Function `requestAI`
(`features/ai/actions.ts`) decides what happens on the server. With no provider it returns at once,
before gathering any context.

## Adding a provider later

1. Implement `AIProvider` in `packages/ai` (keys from the environment, never in code).
2. Add its name to `AI_PROVIDER_NAMES` and its case to `createAIProvider`.
3. In `requestAI`, gather each feature's source context from the user's scope and call the
   capability.

Feature pages do not change. Output must be shown as AI-generated, with its provenance, and kept
apart from imported material (the `AIAction` result view already labels it); AI content never
replaces or silently "corrects" university material (§48).
