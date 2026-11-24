"use client";

import { Button, Field, Input, fieldHintId } from "@medos/ui";
import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";

import { authClient } from "@/lib/auth-client";

import { GoogleMark } from "./google-mark";
import { STUDY_YEARS, YEAR_COOKIE, YEAR_FIELD } from "./year";
import {
  type AuthMode,
  GENERIC_AUTH_ERROR,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  authErrorMessage,
} from "./messages";

export interface AuthFormProps {
  mode: AuthMode;
  /** Same-site path to open after signing in. Already validated by the server. */
  next: string;
  /** Link to the other mode (sign-in ↔ sign-up), carrying `next` along. */
  alternateHref: string;
  /** Whether Google credentials are configured on the server. */
  googleEnabled: boolean;
  /** A message to show on arrival, e.g. after a failed return from Google. */
  initialError?: string | null;
}

const COPY = {
  "sign-in": {
    submit: "Sign in",
    pending: "Signing in…",
    alternatePrompt: "New to MedOS?",
    alternateLink: "Create an account",
  },
  "sign-up": {
    submit: "Create account",
    pending: "Creating account…",
    alternatePrompt: "Already have an account?",
    alternateLink: "Sign in",
  },
} as const;

export function AuthForm({
  mode,
  next,
  alternateHref,
  googleEnabled,
  initialError = null,
}: AuthFormProps) {
  const router = useRouter();
  const ids = useId();
  const [error, setError] = useState<string | null>(initialError);
  const [pending, setPending] = useState<"form" | "google" | null>(null);

  const copy = COPY[mode];
  const isSignUp = mode === "sign-up";
  const field = (name: string) => `${ids}-${name}`;
  const errorId = field("error");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim();
    const year = String(form.get(YEAR_FIELD) ?? "");

    setError(null);
    setPending("form");
    try {
      const result = isSignUp
        ? await authClient.signUp.email(signUpBody(email, password, name, year))
        : await authClient.signIn.email({ email, password });

      if (result.error) {
        setError(authErrorMessage(mode, result.error));
        setPending(null);
        return;
      }
      // Stay in the pending state while the workspace loads.
      router.replace(next);
      router.refresh();
    } catch {
      setError(GENERIC_AUTH_ERROR);
      setPending(null);
    }
  }

  async function onGoogle() {
    if (pending) return;
    setError(null);
    setPending("google");
    if (isSignUp) {
      // Google cannot carry a form field, so the year travels as a short-lived cookie.
      const select = document.getElementById(field("year")) as HTMLSelectElement | null;
      if (!select?.value) {
        select?.reportValidity();
        setPending(null);
        return;
      }
      document.cookie = `${YEAR_COOKIE}=${encodeURIComponent(select.value)}; path=/; max-age=600; samesite=lax`;
    }
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: next,
        errorCallbackURL: "/login?error=google",
      });
      if (result.error) {
        setError(authErrorMessage(mode, result.error));
        setPending(null);
      }
      // On success the browser is already on its way to Google.
    } catch {
      setError(GENERIC_AUTH_ERROR);
      setPending(null);
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={onSubmit}
        className="space-y-4"
        aria-describedby={error ? errorId : undefined}
      >
        {isSignUp ? (
          <Field label="Name" htmlFor={field("name")}>
            <Input
              id={field("name")}
              name="name"
              autoComplete="name"
              required
              maxLength={80}
              className="h-10"
            />
          </Field>
        ) : null}

        {isSignUp ? (
          <Field
            label="Year of study"
            htmlFor={field("year")}
            hint="MedOS is open to Year 3 for now. Years 1 and 2 are coming later."
          >
            <select
              id={field("year")}
              name={YEAR_FIELD}
              required
              defaultValue=""
              aria-describedby={fieldHintId(field("year"))}
              className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg shadow-xs transition-[border-color,box-shadow] duration-150 hover:border-border-strong focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_20%,transparent)] focus-visible:outline-none"
            >
              <option value="" disabled>
                Choose your year
              </option>
              {STUDY_YEARS.map((year) => (
                <option key={year.value} value={year.value} disabled={!year.available}>
                  {year.available ? year.label : `${year.label} (coming later)`}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <Field label="Email" htmlFor={field("email")}>
          <Input
            id={field("email")}
            name="email"
            type="email"
            autoComplete={isSignUp ? "email" : "username"}
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            className="h-10"
          />
        </Field>

        <Field
          label="Password"
          htmlFor={field("password")}
          hint={isSignUp ? `At least ${MIN_PASSWORD_LENGTH} characters.` : undefined}
        >
          <Input
            id={field("password")}
            name="password"
            type="password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            required
            minLength={isSignUp ? MIN_PASSWORD_LENGTH : undefined}
            maxLength={MAX_PASSWORD_LENGTH}
            aria-describedby={isSignUp ? fieldHintId(field("password")) : undefined}
            className="h-10"
          />
        </Field>

        {/* Always mounted, so the message is announced when it appears. */}
        <div id={errorId} role="alert" aria-live="assertive">
          {error ? (
            <p className="flex gap-2.5 rounded-lg border border-danger/25 bg-danger-soft px-3.5 py-2.5 text-sm leading-relaxed text-fg">
              <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger" />
              <span>{error}</span>
            </p>
          ) : null}
        </div>

        <Button type="submit" variant="primary" className="h-10 w-full" disabled={pending !== null}>
          {pending === "form" ? (
            <span
              aria-hidden="true"
              className="size-4 animate-spin rounded-full border-2 border-accent-fg/35 border-t-accent-fg"
            />
          ) : null}
          {pending === "form" ? copy.pending : copy.submit}
        </Button>
      </form>

      {/* Offered only when it is configured: a disabled button on a public page reads as broken. */}
      {googleEnabled ? (
        <>
          <div className="flex items-center gap-3" role="presentation">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-fg-subtle">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button className="h-10 w-full" onClick={onGoogle} disabled={pending !== null}>
            <GoogleMark />
            {pending === "google" ? "Opening Google…" : "Continue with Google"}
          </Button>
        </>
      ) : null}

      <p className="text-sm text-fg-muted">
        {copy.alternatePrompt}{" "}
        <Link
          href={alternateHref}
          className="rounded font-medium text-accent underline-offset-4 hover:underline"
        >
          {copy.alternateLink}
        </Link>
      </p>
    </div>
  );
}

/** The sign-up request, with the year the student chose (checked again by the server). */
function signUpBody(email: string, password: string, name: string, year: string) {
  const body = { email, password, name, [YEAR_FIELD]: year };
  return body as { email: string; password: string; name: string };
}
