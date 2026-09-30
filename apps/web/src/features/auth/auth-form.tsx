"use client";

import { Button, Field, Input, fieldHintId } from "@medos/ui";
import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";

import { authClient } from "@/lib/auth-client";

import { GoogleMark } from "./google-mark";
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

    setError(null);
    setPending("form");
    try {
      const result = isSignUp
        ? await authClient.signUp.email({ email, password, name })
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
          {pending === "form" ? copy.pending : copy.submit}
        </Button>
      </form>

      <div className="flex items-center gap-3" role="presentation">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-fg-subtle">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="space-y-2">
        <Button
          className="h-10 w-full"
          onClick={onGoogle}
          disabled={!googleEnabled || pending !== null}
          aria-describedby={googleEnabled ? undefined : field("google-note")}
        >
          <GoogleMark />
          {pending === "google" ? "Opening Google…" : "Continue with Google"}
        </Button>
        {googleEnabled ? null : (
          <p id={field("google-note")} className="text-center text-xs text-fg-subtle">
            Google sign-in has not been set up for this installation yet.
          </p>
        )}
      </div>

      <p className="text-center text-sm text-fg-muted">
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
