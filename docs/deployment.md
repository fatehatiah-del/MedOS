# Deployment

How to run MedOS somewhere other than this computer (BUILD_PLAN Phase 22). MedOS is a standard
Next.js app with a PostgreSQL database and an object store. Nothing in it depends on one host:
Vercel is described step by step because it is the simplest, and any Node.js host works the same
way.

Nothing here has been deployed yet. Deploying, creating accounts and entering secrets are steps for
you to take; this guide and `npm run check:production` make sure they are complete.

## What a deployment needs

| Part           | On this computer                    | Hosted                                                                           |
| -------------- | ----------------------------------- | -------------------------------------------------------------------------------- |
| App            | `npm run dev` (the launcher)        | `npm run build`, then `npm start`, or a platform such as Vercel                  |
| Database       | Embedded (`pglite:./.medos/pgdata`) | PostgreSQL 15 or newer, e.g. Supabase, Neon, or your own server                  |
| Files          | A folder (`.medos/objects`)         | A private S3-compatible bucket: Supabase Storage, Cloudflare R2, AWS S3, MinIO   |
| Study material | MedOS Sync from your S5 folder      | The same MedOS Sync, run on your computer, pointed at the hosted database/bucket |

MedOS Sync always runs on your computer: a hosted app cannot read your folders. It writes to
whichever database and store its settings name, so pointing it at the hosted ones fills the hosted
app.

## Environment variables

Set these in the host's environment settings, never in a committed file. `.env.example` describes
each one; the full table is in the [README](../README.md#environment-configuration).

| Variable                                                                                                     | Hosted value                                                                                               |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                                               | The PostgreSQL connection string. Behind a transaction pooler (Supabase port 6543), add `?pgbouncer=true`. |
| `AUTH_SECRET`                                                                                                | A new random value for this deployment: `npm run auth:secret`. At least 32 characters.                     |
| `APP_URL`                                                                                                    | The public address, `https://…`, without a trailing slash.                                                 |
| `AUTH_ALLOWED_EMAILS`                                                                                        | Your own address, so nobody else can create an account.                                                    |
| `STORAGE_PROVIDER`                                                                                           | `s3`                                                                                                       |
| `STORAGE_BUCKET`, `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` | The bucket and an access key limited to it.                                                                |
| `AUTH_GOOGLE_CLIENT_ID`, `AUTH_GOOGLE_CLIENT_SECRET`                                                         | Optional, for Google sign-in.                                                                              |
| `AI_PROVIDER`                                                                                                | `none` (or leave unset).                                                                                   |
| `MEDOS_EPHEMERAL_DISK`                                                                                       | `true` on a serverless host other than Vercel (Vercel is recognised by itself).                            |

Leave `DEV_FIXTURE_LECTURES` unset. `MEDOS_SOURCE_DIR` and `MEDOS_SYNC_USER` belong to MedOS Sync
on your computer, not to the host.

### Check before going live

```bash
npm run check:production -- --env path/to/production.env
```

It applies every production rule to the variables in the file (and the shell) and prints all
problems at once, plus what to set up outside MedOS (the migration step, the Google redirect
address). It connects to nothing. The server runs the same check when it starts in production and
refuses to start while a problem remains; warnings go to its log.

The rules: authentication is configured (secret, `APP_URL`), `APP_URL` uses https unless it is
`localhost`, the database URL and storage settings are valid, and on a host without a lasting disk
the database is PostgreSQL and storage is S3. Warnings: sign-up open to anyone, placeholder lectures
on, an embedded database or local folder on a public server.

## Step by step: Supabase and Vercel

### 1. Database and storage (Supabase)

1. Create a project in a region near you (for example Frankfurt, `eu-central-1`).
2. **Database → Connect**: copy two connection strings.
   - The **transaction pooler** (port 6543) for the app: add `?pgbouncer=true` at the end.
   - The **direct connection** or **session pooler** (port 5432) for migrations.
3. **Storage → New bucket**: name it `medos` and keep it **private** (not public).
4. **Storage → Settings → S3 connection**: note the endpoint
   (`https://<project>.supabase.co/storage/v1/s3`) and region, and create an **S3 access key**.

Other providers work the same way: a PostgreSQL URL, and a private bucket with an S3 endpoint and
key. For Cloudflare R2 the region is `auto`.

### 2. Create the database tables

From the repository on your computer, with the **direct** connection string (PowerShell):

```powershell
$env:DATABASE_URL = "postgres://postgres:<password>@db.<project>.supabase.co:5432/postgres"
npm run db:migrate
Remove-Item Env:DATABASE_URL
```

A variable set in the shell takes precedence over `apps/web/.env.local`, so your local database is
untouched. Run this again before each new version goes live: migrations already applied are
skipped, and they only ever add.

### 3. The app (Vercel)

1. Import the GitHub repository as a new project.
2. **Root Directory**: `apps/web`. Framework: Next.js (detected). Keep "Include files outside the
   Root Directory" on: the app uses the workspace packages. Install and build commands: the
   defaults. Node.js: 22 or newer.
3. **Environment Variables**: everything in the table above, for Production.
4. Deploy. Then open the address, create your account (only `AUTH_ALLOWED_EMAILS` can) and sign
   in.

Any other Node.js host: `npm ci`, `npm run build`, then `npm start` (port 3000, or `PORT`), with
the same variables, behind HTTPS. An always-on server with a lasting disk may use the embedded
database and a local folder; the check warns about what that implies.

### 4. Google sign-in (optional)

In the Google Cloud console (see [google-auth-setup.md](google-auth-setup.md)), add
`<APP_URL>/api/auth/callback/google` as an authorised redirect URI and `<APP_URL>` as an authorised
JavaScript origin. `npm run check:production` prints the exact address.

### 5. Material: MedOS Sync to the hosted app

On your computer, point MedOS Sync at the hosted database (direct connection) and bucket for the
run (PowerShell), then sync as usual:

```powershell
$env:DATABASE_URL = "postgres://…:5432/postgres"
$env:STORAGE_PROVIDER = "s3"
$env:STORAGE_BUCKET = "medos"
$env:STORAGE_ENDPOINT = "https://<project>.supabase.co/storage/v1/s3"
$env:STORAGE_REGION = "eu-central-1"
$env:STORAGE_ACCESS_KEY_ID = "…"
$env:STORAGE_SECRET_ACCESS_KEY = "…"
npm run medos-sync -- sync --dry-run
npm run medos-sync -- sync
```

Close the window afterwards so the variables are gone. Your S5 folder is only read, as always.

Your existing local study history (notes, highlights, answers, flashcards and their schedule) is in
the local database; a sync brings material, not history. Moving the history to the hosted database
is a separate step, still to be built.

## After deploying

- Run through the [security checklist](security.md).
- Set up [backups](backup.md).
- Each new version: `npm run db:migrate` with the direct connection string, then deploy.
