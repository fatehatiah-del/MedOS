# Authentication and privacy

What Phase 3 built and why. For setup commands see the README; for Google, see
[`google-auth-setup.md`](google-auth-setup.md).

## Summary

- **Framework:** [Better Auth](https://www.better-auth.com), running inside the MedOS server and
  storing everything in the MedOS PostgreSQL database. No external identity service is involved
  unless Google sign-in is switched on.
- **Methods:** email and password; Google (OAuth 2.0 / OpenID Connect).
- **Sessions:** server-side, in the `auth_sessions` table. The browser holds one signed,
  `HttpOnly` cookie. Nothing is stored in `localStorage`.
- **Boundary:** every route is private unless it is on a short allow-list.

Better Auth was chosen because it supports both methods out of the box, stores its data through
Drizzle in the existing database, and runs on any Node.js host. It does not tie the MedOS data
model to a hosting provider. `CLAUDE.md` asks for a "Supabase-compatible" approach: this works
with any PostgreSQL, including Supabase's, without depending on Supabase Auth.

MedOS writes no cryptography of its own. Password hashing, session tokens, OAuth and CSRF
protection are the framework's. MedOS supplies policy: which methods exist, how long sessions
last, who may create an account, and which tables are used.

## One user, not two

The framework's "user" **is** the `users` table. A person who signs up gets one row there, and
that row's `id` is the `user_id` on all their study data.

```
sign-in (password or Google)
  → auth_accounts   how this person proves who they are
  → users           the MedOS user
  → auth_sessions   an open session for that user
  → user_id on every semester, course, lecture, resource …
```

| Table                | Holds                                                                |
| -------------------- | -------------------------------------------------------------------- |
| `users`              | The person: email, display name, whether the email is verified.      |
| `auth_accounts`      | One row per sign-in method: a password hash, or a Google account id. |
| `auth_sessions`      | Open sessions and their expiry.                                      |
| `auth_verifications` | Short-lived values such as OAuth state.                              |
| `auth_rate_limits`   | Request counters for rate limiting.                                  |

The `auth_` tables are the framework's. Nothing in the academic domain references them.

Creating a user is a single insert guarded by the unique email constraint, so a retried request
or a repeated OAuth callback cannot create a second user. A Google identity maps to exactly one
user through the unique `(provider_id, account_id)` constraint.

## The private boundary

Three layers, from outermost to innermost. The innermost is the one that protects data.

1. **Proxy** (`apps/web/src/proxy.ts`). Runs before every request. Without a session cookie, a
   page request is redirected to `/login` and an API request gets `401`. It only checks that a
   cookie is present, so it is a filter, not the defence: a cookie can be forged.

2. **Session verification** (`apps/web/src/server/session.ts`). `requireUser()` verifies the
   cookie's signature and looks the session up in the database. Every private page calls it
   before rendering anything; route handlers call `getOptionalUserScope()`. Layouts are not
   enough, because they are not re-run when the user navigates between pages. A test
   (`private-pages.test.ts`) fails if a page or handler is added without the check.

3. **User-scoped data access** (`createUserScope` in `@medos/database`). The only way application
   code reaches study data. A scope is created from the verified session's user id, and none of
   its operations accepts a user id, so there is nothing a request could supply to reach another
   user's rows. Asking for someone else's record returns exactly what a missing record returns.
   An ESLint rule stops code outside `src/server` from opening the database directly.

Underneath, the Phase 2 constraints still apply: composite foreign keys make it impossible to
attach a row to another user's parent even if a query were wrong.

**Public routes:** `/login`, `/signup`, and `/api/auth/*`. Everything else, including any route
added later, is private by default. Private pages are rendered per request and never prerendered,
so no study content exists in static files.

**Resources.** `GET /api/resources/<id>` is the only address a resource has. It requires a
session, and answers `404` identically for a resource that belongs to someone else, does not
exist, or has a malformed id, so ids cannot be probed. Ids are random UUIDs. The response never
includes the storage key. When file storage arrives, files are streamed through this same
checked address (or through short-lived signed URLs issued by it), never from a public bucket.

## Passwords

- Hashed with **scrypt** and a random per-user salt by Better Auth. The plaintext is never
  stored or logged.
- Stored only in `auth_accounts.password`. The column is never selected by application code and
  is not part of any response.
- Length: 10 to 128 characters, enforced on the server.
- A wrong password and an unknown email produce the same response and the same message.
- No credentials exist in seed data or in Git. E2E tests create throwaway accounts in a scratch
  database that is deleted on every run.

## Sessions

| Property      | Value                                                                     |
| ------------- | ------------------------------------------------------------------------- |
| Cookie        | `medos.session_token`; `__Secure-medos.session_token` over HTTPS          |
| Flags         | `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` when served over HTTPS |
| Contents      | A signed random token. No user data.                                      |
| Lifetime      | 7 days, extended at most once a day while in use                          |
| Sign-out      | Deletes the session row, so a copied cookie stops working immediately     |
| CSRF          | State-changing auth requests must come from the app's own origin          |
| Rate limiting | 3 sign-in or sign-up attempts per 10 seconds per address, in production   |

Signing out reloads the page fully, which discards every private page the browser's router had
cached.

## Google and existing accounts

When someone signs in with Google using an email that already has a password account, the two
are **not** merged automatically. The framework links a Google identity to an existing account
only if that account's email is verified, and email-and-password accounts are unverified because
MedOS does not send email yet. Otherwise an attacker could register a victim's address first and
inherit the victim's later Google sign-in.

In practice: whichever method created the account is the one to keep using. The login screen
says so when a Google sign-in is refused for this reason.

## Who can create an account

By default anyone who reaches the sign-up page can create an account, which gives them an empty
workspace of their own. They cannot see anyone else's data. For a personal deployment, set
`AUTH_ALLOWED_EMAILS` to your own address: every other sign-up, by either method, is refused.

## Not implemented

- **Email verification and password reset.** Both need an email provider, which MedOS does not
  have. There is currently no way to recover a forgotten password except by editing the
  database. Neither was required by Phase 3 in `BUILD_PLAN.md`.
- **Changing email, password or name** from Settings.
- **Seeding a new account's semester and courses.** A new account starts with no academic data;
  `seedSemester(db, userId)` exists for the phase that connects screens to the database.

## Before going to production

- Set `APP_URL` to the real `https://` address (required: without it, sign-in reports a
  configuration error instead of running unprotected), and a strong `AUTH_SECRET`.
- Set `AUTH_ALLOWED_EMAILS`.
- Use a PostgreSQL server, not the embedded database.
- Check how your host reports the client address. Rate limiting keys on it; if the app is
  reachable without a trusted proxy in front, a client can spoof `X-Forwarded-For`. Configure
  the framework's trusted proxy settings for your host.
- Add an email provider, then enable verification and password reset.
- Add security headers (Content Security Policy and related), planned for Phase 22.
