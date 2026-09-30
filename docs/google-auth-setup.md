# Setting up Google sign-in

Google sign-in is built, but switched off until you give MedOS a Google OAuth client. This is a
manual, one-time step in your own Google account. Until then, the "Continue with Google" button
is shown as unavailable and email-and-password sign-in works normally.

Nothing here costs money. Do not paste the values into a chat or commit them.

## 1. Create the OAuth client

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and create a project (or
   pick an existing one).
2. Go to **Google Auth Platform** (formerly "APIs & Services → OAuth consent screen") and
   complete the basic setup:
   - App name: `MedOS`
   - User support email and developer contact: your address
   - Audience: **External**
   - While the app is in **Testing**, add your own Google address under **Test users**.
     Only listed test users can sign in until you publish the app.
3. The default scopes are all MedOS needs: `openid`, `email`, `profile`.
4. Go to **Clients → Create client** (formerly "Credentials → Create credentials → OAuth client
   ID") and choose **Web application**.
5. Fill in the two lists below, then create the client.

### Authorized JavaScript origins

| Environment       | Value                   |
| ----------------- | ----------------------- |
| Local development | `http://localhost:3000` |
| Production, later | `https://<your-domain>` |

### Authorized redirect URIs

| Environment       | Value                                            |
| ----------------- | ------------------------------------------------ |
| Local development | `http://localhost:3000/api/auth/callback/google` |
| Production, later | `https://<your-domain>/api/auth/callback/google` |

The path `/api/auth/callback/google` is fixed by the app. The origin must match exactly how you
open MedOS, including the port: if you run the dev server on another port, add that origin and
redirect URI too. `http` is only accepted by Google for `localhost`.

## 2. Give the values to MedOS

Google shows a **Client ID** and a **Client secret**. Put them in `apps/web/.env.local`:

```
AUTH_GOOGLE_CLIENT_ID=<client id>
AUTH_GOOGLE_CLIENT_SECRET=<client secret>
```

Both must be set, or both left empty; with only one, sign-in reports a configuration error.
Restart the dev server. The Google button becomes active.

In production, set the same two variables in your host's environment settings, along with
`APP_URL=https://<your-domain>`. `APP_URL` is what MedOS uses to build the redirect URI, so it
must match the origin you registered with Google.

## 3. Check it

1. Open `http://localhost:3000/login` and choose **Continue with Google**.
2. Pick your account. You should land on Today, greeted by your Google name.
3. Settings → Account shows the email; **Sign out** returns you to the login screen.

## If it does not work

| What you see                                   | Likely cause                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| Google: `redirect_uri_mismatch`                | The redirect URI in Google does not exactly match origin + path above. |
| Google: "Access blocked" or "app not verified" | Your address is not listed as a test user, or the app is unpublished.  |
| Back on the login screen with a Google error   | That email already has a password account. Sign in with the password.  |
| The button stays unavailable                   | One of the two variables is empty, or the server was not restarted.    |

The last-but-one row is deliberate: MedOS does not merge a Google identity into an existing
password account automatically. See [`authentication.md`](authentication.md).

## Never commit

- The client secret (`AUTH_GOOGLE_CLIENT_SECRET`)
- `AUTH_SECRET`
- A database connection string with a password
- Any `.env` file other than `.env.example`

`apps/web/.env.local` is git-ignored. The client ID is not secret, but keep it in the same file
for simplicity.
