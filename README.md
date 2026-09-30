# MedOS

A personal medical-school study operating system. MedOS organises a semester around the learning
cycle, from university schedule and lecture material through study guides, questions, flashcards
and spaced review to exam preparation.

> Documents are inputs. Learning is the product.

MedOS is a private, single-user application. It is not a generic LMS, document manager or SaaS
dashboard.

| Document                                       | Purpose                                                  |
| ---------------------------------------------- | -------------------------------------------------------- |
| [`CLAUDE.md`](CLAUDE.md)                       | Product and engineering specification (source of truth). |
| [`BUILD_PLAN.md`](BUILD_PLAN.md)               | Staged implementation roadmap with acceptance gates.     |
| [`docs/architecture.md`](docs/architecture.md) | Architecture decisions and assumptions made so far.      |

## Current status

| Phase | Scope                                 | Status      |
| ----- | ------------------------------------- | ----------- |
| 0     | Repository and engineering foundation | Complete    |
| 1     | Design system and application shell   | Complete    |
| 2     | Database foundation                   | Next        |
| 3     | Authentication and privacy            | Planned     |
| 4–22  | See `BUILD_PLAN.md`                   | Not started |

What exists today is the application shell: navigation, theming, the design system and ten routes
with honest empty states. There is **no database, authentication, sync, parsing, question engine,
flashcard scheduling or AI**. The Today screen renders a clearly labelled development fixture.

## Architecture

An npm-workspaces monorepo. Workspace packages ship TypeScript source and are compiled by the app
that consumes them, so there is no separate build step for packages.

```
MedOS/
├── apps/
│   └── web/                 Next.js application (App Router)
│       ├── e2e/             Playwright tests
│       └── src/
│           ├── app/         Routes; (app)/ is the shell-wrapped workspace
│           ├── components/  Shell, theme and shared app components
│           ├── config/      Navigation
│           ├── features/    Feature modules (today, courses, calendar, search, settings)
│           ├── lib/         Small framework-agnostic utilities
│           └── env.ts       Validated environment configuration
├── packages/
│   ├── shared/              Domain constants and pure helpers (courses, semester, dates, study time)
│   └── ui/                  Design tokens and reusable, accessible UI primitives
├── docs/
├── CLAUDE.md
├── BUILD_PLAN.md
└── .env.example
```

Packages planned by the specification are added when their phase begins, rather than created
empty: `packages/database` (Phase 2), `apps/sync` (Phase 5), `packages/parsers` (Phase 6),
`packages/fsrs` (Phase 11) and `packages/study-engine` (Phase 15).

### Stack

| Area       | Choice                                                     |
| ---------- | ---------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, Turbopack), React 19               |
| Language   | TypeScript, strict mode with `noUncheckedIndexedAccess`    |
| Styling    | Tailwind CSS v4 with semantic design tokens                |
| Primitives | Radix UI (dialog, dropdown menu, tabs), lucide icons       |
| Validation | Zod                                                        |
| Tests      | Vitest and React Testing Library; Playwright with axe-core |
| Quality    | ESLint (flat config), Prettier                             |

MedOS is Vercel-ready but hosting-provider-independent: it uses only standard Next.js features and
environment variables, and runs anywhere Node.js does (`npm run build && npm run start`).

## Getting started

Prerequisites: **Node.js 22 or newer** and **npm 11** (bundled with recent Node.js). No other
package manager is used.

```bash
npm install
npm run test:e2e:install     # one-time: downloads the Chromium build used by Playwright
npm run dev                  # http://localhost:3000
```

## Commands

Run from the repository root.

| Command             | What it does                                                 |
| ------------------- | ------------------------------------------------------------ |
| `npm run dev`       | Start the development server.                                |
| `npm run build`     | Create the production build.                                 |
| `npm run start`     | Serve the production build.                                  |
| `npm run typecheck` | Type-check every workspace.                                  |
| `npm run lint`      | Lint the repository with ESLint.                             |
| `npm run format`    | Format with Prettier (`format:check` verifies only).         |
| `npm run test`      | Run unit and component tests once (`test:watch` to watch).   |
| `npm run test:e2e`  | Build for production, then run the Playwright suite.         |
| `npm run validate`  | Typecheck, lint, format check, unit tests and E2E, in order. |

Extra arguments are forwarded, for example `npm run dev -- --port 4000`.

### Tests

- **Unit and component tests** live beside the code as `*.test.ts(x)` and run in three Vitest
  projects: `shared` (Node), `ui` and `web` (jsdom).
- **End-to-end tests** live in `apps/web/e2e` and run against the production build in a desktop
  and a mobile viewport. They cover every route, navigation, the sidebar, theming and persistence,
  keyboard use, horizontal overflow, and automated accessibility checks (including colour
  contrast) in both themes.

## Environment configuration

Configuration is read only from environment variables and validated at startup by
[`apps/web/src/env.ts`](apps/web/src/env.ts); an invalid value stops the app with a clear message.

```bash
cp .env.example apps/web/.env.local
```

| Variable      | Required | Default | Notes                               |
| ------------- | -------- | ------- | ----------------------------------- |
| `AI_PROVIDER` | No       | `none`  | `none` is the only supported value. |
| `APP_URL`     | No       | —       | Public base URL of the deployment.  |

Variables for the database, authentication and storage are listed in `.env.example` as reserved
and are not read yet. Real `.env` files are git-ignored; never commit secrets.

## Design system

Tokens live in [`packages/ui/src/styles/theme.css`](packages/ui/src/styles/theme.css). Components
use semantic tokens (`canvas`, `surface`, `fg`, `accent`, course colours) instead of raw colours,
so light and dark are two deliberate palettes. The theme (Light, Dark or System) is stored per
device and applied before first paint.

Layout responds to the width of the workspace rather than the viewport (container queries), so
pages adapt correctly whether the sidebar is expanded, collapsed to a rail, or replaced by the
drawer on tablet and mobile.

## Privacy

MedOS holds private study data. Indexing is disabled through `robots.txt`, a `robots` meta tag and
an `X-Robots-Tag` header. **Authentication is not implemented yet (Phase 3), so do not deploy this
build publicly.**
