import { redirect } from "next/navigation";

import { getAuthConfig } from "@/server/auth/auth";
import { LOGIN_PATH, SIGNUP_PATH, safeRedirectPath } from "@/server/auth/routes";
import { getCurrentUser } from "@/server/session";

import { AuthForm } from "./auth-form";
import { type AuthMode, oauthErrorMessage } from "./messages";

/** Query parameters of the login and sign-up pages. */
export type AuthSearchParams = Promise<Record<string, string | string[] | undefined>>;

const HEADINGS: Record<AuthMode, { title: string; description: string }> = {
  "sign-in": {
    title: "Sign in",
    description: "Your private study workspace.",
  },
  "sign-up": {
    title: "Create your account",
    description: "Your study data stays private to you.",
  },
};

const single = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/** Shared body of /login and /signup. */
export async function AuthPage({
  mode,
  searchParams,
}: {
  mode: AuthMode;
  searchParams: AuthSearchParams;
}) {
  const params = await searchParams;
  const next = safeRedirectPath(single(params.next));

  // Someone already signed in has no business on these pages.
  if (await getCurrentUser()) redirect(next);

  const { google } = getAuthConfig();
  const heading = HEADINGS[mode];
  const alternate = mode === "sign-in" ? SIGNUP_PATH : LOGIN_PATH;
  const alternateHref =
    single(params.next) === undefined ? alternate : `${alternate}?next=${encodeURIComponent(next)}`;

  return (
    <>
      <header className="mb-8 space-y-2 text-center">
        <h1 className="font-serif text-[28px] leading-tight font-medium tracking-[-0.01em] text-fg">
          {heading.title}
        </h1>
        <p className="text-[15px] text-fg-muted">{heading.description}</p>
      </header>

      <AuthForm
        mode={mode}
        next={next}
        alternateHref={alternateHref}
        googleEnabled={google !== null}
        initialError={mode === "sign-in" ? oauthErrorMessage(single(params.error)) : null}
      />
    </>
  );
}
