# Security checklist

What protects MedOS and your data, how each point is verified, and what to confirm on a deployment.
The authentication design is in [authentication.md](authentication.md).

## Built in, and tested

| Area                    | What MedOS does                                                                                                                                                  | Verified by                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Sign-in                 | Password hashing, server-side sessions, CSRF and origin checks, a sign-in rate limit, optional allow-list of addresses.                                          | `src/server/auth/*.test.ts`, `e2e/auth.spec.ts`                                |
| Private by default      | A request without a session cookie never reaches a private page (login redirect) or API (401). Every page and handler then verifies the session itself.          | `src/server/private-pages.test.ts`, `e2e/auth.spec.ts`, `e2e/security.spec.ts` |
| One user's data         | Data is reached only through a scope bound to the signed-in user; another user's ids behave as nonexistent.                                                      | `packages/database/src/access/*.test.ts`, the export tests                     |
| Files                   | Originals and images are served only to their owner, checked against their SHA-256, never cached, sandboxed; storage locations never leave the server.           | `src/features/resources/*.test.ts`, `e2e/security.spec.ts`                     |
| Private responses       | `Cache-Control: private, no-store` on every response carrying study data, including 401s.                                                                        | `e2e/security.spec.ts`, `e2e/export.spec.ts`                                   |
| No indexing             | `X-Robots-Tag: noindex, nofollow` on every response, robots meta, robots.txt.                                                                                    | `e2e/smoke.spec.ts`, `e2e/security.spec.ts`                                    |
| Content Security Policy | Scripts only from MedOS with a nonce new for every request (`'strict-dynamic'`), no eval, nothing loaded from or sent to another origin, no framing, no plugins. | `e2e/security.spec.ts`; every E2E test fails on any policy violation           |
| Other headers           | HSTS, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, `Cross-Origin-Opener-Policy`, a restrictive `Permissions-Policy`.                      | `e2e/security.spec.ts`                                                         |
| Secrets                 | Read on the server only; none uses a `NEXT_PUBLIC_` name; `.env` files are git-ignored.                                                                          | `src/env-schema.ts`, `.gitignore`                                              |
| Configuration           | Production refuses to start with an unsafe or incomplete configuration, listing every problem.                                                                   | `src/server/production-check.test.ts`                                          |
| No AI traffic           | With `AI_PROVIDER=none`, no request leaves MedOS.                                                                                                                | `e2e/ai.spec.ts`                                                               |

The headers are set in `src/server/security-headers.ts`: the fixed ones on every response by
`next.config.ts`, the Content Security Policy with its nonce by `src/proxy.ts`.

## On each deployment

- [ ] `npm run check:production -- --env <file>` reports no problems.
- [ ] `APP_URL` is the real `https://` address.
- [ ] `AUTH_SECRET` is new for this deployment (not the one on your computer) and is stored only in the host's settings.
- [ ] `AUTH_ALLOWED_EMAILS` is set to your address.
- [ ] The bucket is private, and its access key can reach only that bucket.
- [ ] The database password is strong, and the database accepts only encrypted connections.
- [ ] Google sign-in (if on): only `<APP_URL>/api/auth/callback/google` is an authorised redirect URI.
- [ ] After deploying, signed out: `<APP_URL>/today` goes to the login page, and
      `<APP_URL>/api/export?format=json` answers 401.
- [ ] Backups are set up ([backup.md](backup.md)).

## Reporting a problem

MedOS is a personal project. If you find a weakness, fix it in the repository with a test that
shows it is closed, and add it to this checklist.
