# MedOS

A personal medical-school study operating system. MedOS organises a semester around the learning
cycle, from university schedule and lecture material through study guides, questions, flashcards
and spaced review to exam preparation.

> Documents are inputs. Learning is the product.

MedOS is a private, single-user application. It is not a generic LMS, document manager or SaaS
dashboard.

| Document                                                   | Purpose                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------- |
| [`CLAUDE.md`](CLAUDE.md)                                   | Product and engineering specification (source of truth).      |
| [`BUILD_PLAN.md`](BUILD_PLAN.md)                           | Staged implementation roadmap with acceptance gates.          |
| [`docs/architecture.md`](docs/architecture.md)             | Architecture decisions and assumptions made so far.           |
| [`docs/database.md`](docs/database.md)                     | Data model, integrity rules and database workflow.            |
| [`docs/academic-hierarchy.md`](docs/academic-hierarchy.md) | Courses, weeks, lectures, routes and completion.              |
| [`docs/sync.md`](docs/sync.md)                             | MedOS Sync: setup, commands, folder rules, safety guarantees. |
| [`docs/parsing.md`](docs/parsing.md)                       | Parsing pipeline, content model, fidelity and security.       |
| [`docs/reader.md`](docs/reader.md)                         | Study Guide reader: rendering, annotations, progress, images. |
| [`docs/lecture-viewer.md`](docs/lecture-viewer.md)         | Original lecture viewer: PDF rendering, pages, privacy.       |
| [`docs/mcq.md`](docs/mcq.md)                               | MCQ engine: Learn, Exam and USMLE modes, attempts, results.   |
| [`docs/question-bank.md`](docs/question-bank.md)           | Question Bank active recall: reveal, rate, record.            |
| [`docs/authentication.md`](docs/authentication.md)         | Sign-in, sessions and the private boundary.                   |
| [`docs/google-auth-setup.md`](docs/google-auth-setup.md)   | Manual steps to enable Google sign-in.                        |

## Current status

| Phase | Scope                                 | Status      |
| ----- | ------------------------------------- | ----------- |
| 0     | Repository and engineering foundation | Complete    |
| 1     | Design system and application shell   | Complete    |
| 2     | Database foundation                   | Complete    |
| 3     | Authentication and privacy            | Complete    |
| 4     | Course / week / lecture system        | Complete    |
| 5     | Local MedOS sync CLI                  | Complete    |
| 6     | Parsing and resource pipeline         | Complete    |
| 7     | Study Guide reader                    | Complete    |
| 8     | Original lecture viewer               | Complete    |
| 9     | MCQ engine                            | Complete    |
| 10    | Question Bank / active recall         | Complete    |
| 11–22 | See `BUILD_PLAN.md`                   | Not started |

What exists today:

- the application shell: navigation, theming, the design system and ten routes with honest empty
  states;
- the database foundation: schema, migrations, client and development seed;
- authentication and the private boundary: sign-in with email and password or Google, server-side
  sessions, and user-scoped data access;
- the academic structure: courses, weeks and lectures from the database, lecture pages with their
  five kinds of material, and manual lecture completion with course and week progress;
- MedOS Sync: a local command that reads your study folder (never writing to it) and imports its
  courses, weeks, lectures and materials, with a dry run, change detection and a manifest;
- parsing: imported Study Guides, MCQ quizzes, Question Banks and lecture PDFs are read into
  validated, source-faithful structured content, shown as ready (or with a plain reason why not)
  on each lecture page;
- the Study Guide reader: the parsed guide as structured, accessible reading (contents, semantic
  callouts, real tables, figures with their private images), with highlights, notes, bookmarks,
  Review Later and reading progress that survive a reload. Reading progress is not lecture
  completion: only **Mark lecture complete** completes a lecture;
- the original lecture viewer: the lecture PDF rendered privately and lazily in MedOS, with page
  navigation, zoom, fullscreen, page bookmarks, notes and Review Later, resuming at the last page,
  and a private download of the original;
- the MCQ engine: imported quizzes practised in Learn, Exam and USMLE modes, marked on the server,
  with a timer, navigator and flags, results by topic and question type, and every attempt kept;
- Question Bank active recall: reveal the model answer (typing optional), rate Again, Hard, Good or
  Easy, with every attempt and rating kept, and the sidebar Question Bank page listing your banks.

Study Guides and lecture PDFs can be read in MedOS, quizzes practised and question banks used
for active recall; flashcards are Phase 11. Until you run a sync, lectures are development placeholders when enabled
(see [`docs/academic-hierarchy.md`](docs/academic-hierarchy.md)). The Today screen's
schedule and plan are a clearly labelled development fixture. There is **no flashcard
scheduling or AI** yet.

### Checkpoints

- **Question Bank count (checked in Phase 10).** The Pharmacology Week 1 bank was expected to hold
  21 questions; MedOS reads 40. The file is titled "Practice Quiz" and holds the same 40 questions
  as the week's MCQ quiz, so 40 is what it contains (see
  [`docs/question-bank.md`](docs/question-bank.md)). A different bank may have been intended;
  nothing was changed.

## Architecture

An npm-workspaces monorepo. Workspace packages ship TypeScript source and are compiled by the app
that consumes them, so there is no separate build step for packages.

```
MedOS/
├── apps/
│   ├── sync/                MedOS Sync, the local command that imports the study folder
│   └── web/                 Next.js application (App Router)
│       ├── e2e/             Playwright tests
│       └── src/
│           ├── app/         Routes; (app)/ is the shell-wrapped workspace
│           ├── components/  Shell, theme and shared app components
│           ├── config/      Navigation
│           ├── features/    Feature modules (today, courses, calendar, search, settings)
│           ├── lib/         Small framework-agnostic utilities
│           ├── server/      Trusted boundary: auth service, session checks, database handle
│           ├── proxy.ts     Redirects requests without a session cookie to /login
│           └── env.ts       Validated environment configuration
├── packages/
│   ├── parsers/             Source files → typed, source-faithful content (DOCX, HTML quiz, PDF)
│   ├── database/            PostgreSQL schema, migrations, client and development seed
│   │   ├── migrations/      Generated SQL migrations (tracked)
│   │   └── src/             schema/, seed/, cli/, client.ts, config.ts
│   ├── shared/              Domain constants and pure helpers (courses, semester, dates, study time)
│   ├── storage/             Content-addressed object storage, shared by the sync and the web app
│   └── ui/                  Design tokens and reusable, accessible UI primitives
├── docs/
├── CLAUDE.md
├── BUILD_PLAN.md
└── .env.example
```

Packages planned by the specification are added when their phase begins, rather than created
empty: `packages/fsrs` (Phase 11) and `packages/study-engine`
(Phase 15).

### Stack

| Area       | Choice                                                      |
| ---------- | ----------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, Turbopack), React 19                |
| Language   | TypeScript, strict mode with `noUncheckedIndexedAccess`     |
| Styling    | Tailwind CSS v4 with semantic design tokens                 |
| Primitives | Radix UI (dialog, dropdown menu, tabs), lucide icons        |
| Database   | PostgreSQL, Drizzle ORM, drizzle-kit migrations             |
| Auth       | Better Auth (email and password, Google), database sessions |
| Validation | Zod                                                         |
| Tests      | Vitest and React Testing Library; Playwright with axe-core  |
| Quality    | ESLint (flat config), Prettier                              |

MedOS is Vercel-ready but hosting-provider-independent: it uses only standard Next.js features and
environment variables, and runs anywhere Node.js does (`npm run build && npm run start`).

## Getting started

Prerequisites: **Node.js 22 or newer** and **npm 11** (bundled with recent Node.js). No other
package manager is used.

```bash
npm install
cp .env.example apps/web/.env.local
npm run auth:secret          # paste the output into AUTH_SECRET in apps/web/.env.local
npm run db:migrate           # create the database (stop the dev server first)
npm run dev                  # http://localhost:3000
```

Open http://localhost:3000, choose **Create an account**, and sign up with any email and a
password of at least 10 characters. No email is sent. To run the E2E tests, also run
`npm run test:e2e:install` once; it downloads the Chromium build used by Playwright.

## Commands

Run from the repository root.

| Command               | What it does                                                |
| --------------------- | ----------------------------------------------------------- |
| `npm run dev`         | Start the development server.                               |
| `npm run build`       | Create the production build.                                |
| `npm run start`       | Serve the production build.                                 |
| `npm run typecheck`   | Type-check every workspace.                                 |
| `npm run lint`        | Lint the repository with ESLint.                            |
| `npm run format`      | Format with Prettier (`format:check` verifies only).        |
| `npm run test`        | Run unit and component tests once (`test:watch` to watch).  |
| `npm run test:e2e`    | Build for production, then run the Playwright suite.        |
| `npm run validate`    | Typecheck, lint, format check, migration check, tests, E2E. |
| `npm run auth:secret` | Print a new random value for `AUTH_SECRET`.                 |

Extra arguments are forwarded, for example `npm run dev -- --port 4000`.

### Tests

- **Unit and component tests** live beside the code as `*.test.ts(x)` and run in four Vitest
  projects: `shared` and `database` (Node), `ui` and `web` (jsdom).
- **Database tests** are part of `npm run test`. Each test file starts a fresh in-memory PostgreSQL
  (PGlite), applies the tracked migrations to it, and exercises the real constraints. Run them
  alone with `npx vitest run --project database`.
- **Authentication and privacy tests** are part of `npm run test` too. They run the real
  authentication service against an in-memory database (hashing, sessions, sign-out, CSRF, rate
  limiting) and check that one user cannot read or change another's data. Run them alone with
  `npx vitest run --project web src/server` and
  `npx vitest run --project database user-scope`.
- **End-to-end tests** live in `apps/web/e2e` and run against the production build in a desktop
  and a mobile viewport. Each run starts from an empty scratch database and signs up through the
  real screens; there is no test-only way past authentication. They cover the login boundary,
  sign-in and sign-out, every route, navigation, theming, keyboard use, horizontal overflow, and
  automated accessibility checks (including colour contrast) in both themes.

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
open the folder at a time. The running app holds it open, so **stop the dev server before running
`db:migrate`, `db:seed` or `db:studio`**, or use a PostgreSQL server.

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

`db:seed` creates a placeholder user, the Fall 2026 semester, the six courses and placeholder weeks
and lectures for each course. It is development data, not imported university material.

You do not need `db:seed` to use the app: signing in creates your semester and six courses. To see
placeholder weeks and lectures in your own account, set `DEV_FIXTURE_LECTURES=true` in
`apps/web/.env.local` and restart the dev server. They are added once, to an account with no weeks
yet, and are labelled as development data.

## Importing your study folder

MedOS Sync reads your Semester 5 folder and brings it into MedOS. It only ever reads the folder:
nothing in it is created, changed, renamed, moved or deleted. Full details are in
[`docs/sync.md`](docs/sync.md).

1. Sign up in the app, then stop the dev server.
2. Add `MEDOS_SOURCE_DIR` (your folder) and `MEDOS_SYNC_USER` (your MedOS email) to
   `apps/web/.env.local`.
3. Look first: `npm run medos-sync -- sync --dry-run`. Nothing is changed.
4. Import: `npm run medos-sync -- sync`. New and changed materials are then read into MedOS
   content ([`docs/parsing.md`](docs/parsing.md)); `npm run medos-sync -- process` does that step
   on its own.

`npm run medos-sync -- scan` shows what the folder contains without using the database, and
`npm run medos-sync -- status` shows what earlier syncs recorded.

## Authentication

MedOS is private: every page except the login and sign-up screens requires a session. Sign-in is
handled by [Better Auth](https://www.better-auth.com) running inside the app, with sessions and
accounts stored in the MedOS database. The design is described in
[`docs/authentication.md`](docs/authentication.md).

| Method             | Status                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------- |
| Email and password | Works out of the box. Passwords are hashed with scrypt; 10 to 128 characters.             |
| Google             | Built; needs your own Google OAuth client. Until then the button is shown as unavailable. |

To enable Google, follow [`docs/google-auth-setup.md`](docs/google-auth-setup.md). The redirect
URI to register is `<APP_URL>/api/auth/callback/google`, for example
`http://localhost:3000/api/auth/callback/google`.

Things to know:

- An email that signed up with a password is not merged with a later Google sign-in for the same
  address. Keep using the method the account was created with.
- There is no email verification or password reset yet, because MedOS has no email provider.
- Anyone who can reach the sign-up page can create their own, empty account. For a personal
  deployment set `AUTH_ALLOWED_EMAILS` to your address.
- Sign out from the account menu (top right) or from Settings.

## Environment configuration

Configuration is read only from environment variables, from `apps/web/.env.local` in development.
Invalid values stop the affected feature with a clear message. The database commands read
`DATABASE_URL` from the same file.

```bash
cp .env.example apps/web/.env.local
```

| Variable                    | Required      | Default          | Notes                                                                          |
| --------------------------- | ------------- | ---------------- | ------------------------------------------------------------------------------ |
| `DATABASE_URL`              | Yes           | —                | See [Database](#database).                                                     |
| `AUTH_SECRET`               | Yes           | —                | Signs session cookies. At least 32 characters; `npm run auth:secret`.          |
| `APP_URL`                   | In production | —                | Public address of the app, e.g. `https://medos.example`.                       |
| `AUTH_GOOGLE_CLIENT_ID`     | No            | —                | Set together with the secret to enable Google sign-in.                         |
| `AUTH_GOOGLE_CLIENT_SECRET` | No            | —                | Server-only.                                                                   |
| `AUTH_ALLOWED_EMAILS`       | No            | —                | Comma-separated addresses allowed to create an account.                        |
| `MEDOS_SOURCE_DIR`          | For sync      | —                | Your study folder. Read only.                                                  |
| `MEDOS_SYNC_USER`           | For sync      | —                | Email of the MedOS account to import into.                                     |
| `MEDOS_STORAGE_DIR`         | No            | `.medos/objects` | Copies of originals and extracted images; read by the sync and the web app.    |
| `DEV_FIXTURE_LECTURES`      | No            | `false`          | `true` adds placeholder weeks and lectures to a new account. Development only. |
| `AI_PROVIDER`               | No            | `none`           | `none` is the only supported value.                                            |

None of these is exposed to the browser. Variables for storage are listed in `.env.example` as
reserved and are not read yet. Real `.env` files are git-ignored; never commit secrets.

## Design system

Tokens live in [`packages/ui/src/styles/theme.css`](packages/ui/src/styles/theme.css). Components
use semantic tokens (`canvas`, `surface`, `fg`, `accent`, course colours) instead of raw colours,
so light and dark are two deliberate palettes. The theme (Light, Dark or System) is stored per
device and applied before first paint.

Layout responds to the width of the workspace rather than the viewport (container queries), so
pages adapt correctly whether the sidebar is expanded, collapsed to a rail, or replaced by the
drawer on tablet and mobile.

## Privacy

MedOS holds private study data.

- Every route is private unless it is one of `/login`, `/signup` or `/api/auth/*`.
- Private pages are rendered per request for the signed-in user and are never prerendered or
  publicly cached.
- Data access is bound to the signed-in user; another user's record is indistinguishable from one
  that does not exist.
- Indexing is disabled through `robots.txt`, a `robots` meta tag and an `X-Robots-Tag` header.
- No analytics, advertising or telemetry is added by MedOS. Next.js's own anonymous telemetry can
  be switched off with `npx next telemetry disable`.

Before deploying publicly, read the production checklist at the end of
[`docs/authentication.md`](docs/authentication.md).
