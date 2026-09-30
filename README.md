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
| [`docs/database.md`](docs/database.md)         | Data model, integrity rules and database workflow.       |

## Current status

| Phase | Scope                                 | Status      |
| ----- | ------------------------------------- | ----------- |
| 0     | Repository and engineering foundation | Complete    |
| 1     | Design system and application shell   | Complete    |
| 2     | Database foundation                   | Complete    |
| 3     | Authentication and privacy            | Next        |
| 4–22  | See `BUILD_PLAN.md`                   | Not started |

What exists today is the application shell (navigation, theming, the design system and ten routes
with honest empty states) and the database foundation (schema, migrations, client and development
seed). The two are not connected yet: the screens still render fixtures and empty states, and the
Today screen is a clearly labelled development fixture. There is **no authentication, sync,
parsing, question engine, flashcard scheduling or AI**.

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
│   ├── database/            PostgreSQL schema, migrations, client and development seed
│   │   ├── migrations/      Generated SQL migrations (tracked)
│   │   └── src/             schema/, seed/, cli/, client.ts, config.ts
│   ├── shared/              Domain constants and pure helpers (courses, semester, dates, study time)
│   └── ui/                  Design tokens and reusable, accessible UI primitives
├── docs/
├── CLAUDE.md
├── BUILD_PLAN.md
└── .env.example
```

Packages planned by the specification are added when their phase begins, rather than created
empty: `apps/sync` (Phase 5), `packages/parsers` (Phase 6), `packages/fsrs` (Phase 11) and
`packages/study-engine` (Phase 15).

### Stack

| Area       | Choice                                                     |
| ---------- | ---------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, Turbopack), React 19               |
| Language   | TypeScript, strict mode with `noUncheckedIndexedAccess`    |
| Styling    | Tailwind CSS v4 with semantic design tokens                |
| Primitives | Radix UI (dialog, dropdown menu, tabs), lucide icons       |
| Database   | PostgreSQL, Drizzle ORM, drizzle-kit migrations            |
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

| Command             | What it does                                                |
| ------------------- | ----------------------------------------------------------- |
| `npm run dev`       | Start the development server.                               |
| `npm run build`     | Create the production build.                                |
| `npm run start`     | Serve the production build.                                 |
| `npm run typecheck` | Type-check every workspace.                                 |
| `npm run lint`      | Lint the repository with ESLint.                            |
| `npm run format`    | Format with Prettier (`format:check` verifies only).        |
| `npm run test`      | Run unit and component tests once (`test:watch` to watch).  |
| `npm run test:e2e`  | Build for production, then run the Playwright suite.        |
| `npm run validate`  | Typecheck, lint, format check, migration check, tests, E2E. |

Extra arguments are forwarded, for example `npm run dev -- --port 4000`.

### Tests

- **Unit and component tests** live beside the code as `*.test.ts(x)` and run in four Vitest
  projects: `shared` and `database` (Node), `ui` and `web` (jsdom).
- **Database tests** are part of `npm run test`. Each test file starts a fresh in-memory PostgreSQL
  (PGlite), applies the tracked migrations to it, and exercises the real constraints. Run them
  alone with `npx vitest run --project database`.
- **End-to-end tests** live in `apps/web/e2e` and run against the production build in a desktop
  and a mobile viewport. They cover every route, navigation, the sidebar, theming and persistence,
  keyboard use, horizontal overflow, and automated accessibility checks (including colour
  contrast) in both themes.

## Database

PostgreSQL, accessed through [Drizzle ORM](https://orm.drizzle.team) and owned entirely by
[`packages/database`](packages/database). The data model and its integrity rules are described in
[`docs/database.md`](docs/database.md).

`DATABASE_URL` decides where the database lives:

| Value                    | Meaning                                                                 |
| ------------------------ | ----------------------------------------------------------------------- |
| `pglite:./.medos/pgdata` | Embedded PostgreSQL in a local folder. Nothing to install.              |
| `postgres://…`           | A PostgreSQL server, local or hosted. Use this for anything long-lived. |

The embedded option (the default in `.env.example`) is real PostgreSQL compiled to WebAssembly. It
runs the same migrations and enforces the same constraints as a server, but only one process can
open the folder at a time.

```bash
cp .env.example apps/web/.env.local   # once
npm run db:migrate                    # create or update the schema
npm run db:seed                       # development data (safe to repeat)
```

| Command               | What it does                                                       |
| --------------------- | ------------------------------------------------------------------ |
| `npm run db:generate` | Write a new SQL migration from changes to the schema files.        |
| `npm run db:check`    | Verify the migration history is consistent.                        |
| `npm run db:migrate`  | Apply pending migrations to the database in `DATABASE_URL`.        |
| `npm run db:seed`     | Insert development data. Idempotent; refuses to run in production. |
| `npm run db:studio`   | Browse the database with Drizzle Studio.                           |

Schema changes always go through a migration: edit `packages/database/src/schema`, run
`db:generate`, review and commit the generated SQL. A test fails if the schema and the migrations
disagree.

`db:seed` creates a placeholder user, the Fall 2026 semester, the six courses and three structural
weeks (with one, two and no lectures). It is development data, not imported university material.

## Environment configuration

Configuration is read only from environment variables. The web app validates its variables at
startup in [`apps/web/src/env.ts`](apps/web/src/env.ts); an invalid value stops it with a clear
message. The database commands read `DATABASE_URL` from the same file.

```bash
cp .env.example apps/web/.env.local
```

| Variable       | Required            | Default | Notes                                                        |
| -------------- | ------------------- | ------- | ------------------------------------------------------------ |
| `AI_PROVIDER`  | No                  | `none`  | `none` is the only supported value.                          |
| `APP_URL`      | No                  | —       | Public base URL of the deployment.                           |
| `DATABASE_URL` | For `db:*` commands | —       | See [Database](#database). The web app does not read it yet. |

Variables for authentication and storage are listed in `.env.example` as reserved and are not read
yet. Real `.env` files are git-ignored; never commit secrets.

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
