"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";

import { signIn, signUp } from "./actions";

export type AuthFormState = {
  status: "idle" | "error" | "sent";
  /** A problem with the whole form, such as a wrong password. */
  message?: string;
  fieldErrors?: { email?: string[]; password?: string[] };
  /** The email as typed, so it survives a failed attempt. */
  email?: string;
};

const initialState: AuthFormState = { status: "idle" };

type AuthFormProps = {
  mode: "sign-in" | "sign-up";
  /** Where to go after signing in. Validated again on the server. */
  next?: string;
  /** A message carried over from a redirect. */
  notice?: string;
};

export function AuthForm({ mode, next, notice }: AuthFormProps) {
  const isSignUp = mode === "sign-up";
  const [state, formAction, pending] = useActionState(
    isSignUp ? signUp : signIn,
    initialState,
  );
  const [showPassword, setShowPassword] = useState(false);
  // Next.js keeps the previous route mounted but hidden, so two copies of
  // this form can share a document. Generated ids keep each label tied to
  // its own field.
  const id = useId();
  const emailId = `${id}-email`;
  const passwordId = `${id}-password`;

  if (state.status === "sent") {
    return (
      <div role="status" className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Check your email</h2>
        <p className="leading-7 text-muted">
          We sent a confirmation link to{" "}
          <span className="font-medium break-all text-foreground">
            {state.email}
          </span>
          . Open it on this device to finish creating your account.
        </p>
        <p className="leading-7 text-muted">
          Nothing after a few minutes? Check your spam folder. If you already
          have an account, <Link href="/sign-in">sign in</Link> instead.
        </p>
      </div>
    );
  }

  const emailError = state.fieldErrors?.email?.[0];
  const passwordError = state.fieldErrors?.password?.[0];

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {notice ? (
        <p
          role="status"
          className="rounded-xl border border-border bg-surface px-4 py-3 text-sm leading-6"
        >
          {notice}
        </p>
      ) : null}

      {state.message ? (
        <p
          role="alert"
          className="rounded-xl border border-danger px-4 py-3 text-sm leading-6 text-danger"
        >
          {state.message}
        </p>
      ) : null}

      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div className="flex flex-col gap-2">
        <label htmlFor={emailId} className="text-sm font-medium">
          Email
        </label>
        <input
          id={emailId}
          name="email"
          type="email"
          required
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={state.email}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? `${emailId}-error` : undefined}
          className="field"
        />
        {emailError ? (
          <p id={`${emailId}-error`} className="text-sm text-danger">
            {emailError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={passwordId} className="text-sm font-medium">
          Password
        </label>
        <div className="relative">
          <input
            id={passwordId}
            name="password"
            type={showPassword ? "text" : "password"}
            required
            minLength={isSignUp ? 8 : undefined}
            maxLength={72}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            aria-invalid={passwordError ? true : undefined}
            aria-describedby={
              passwordError
                ? `${passwordId}-error`
                : isSignUp
                  ? `${passwordId}-hint`
                  : undefined
            }
            className="field pr-18"
          />
          <button
            type="button"
            onClick={() => setShowPassword((shown) => !shown)}
            aria-pressed={showPassword}
            aria-label="Show password"
            className="absolute inset-y-0 right-0 min-w-16 rounded-r-xl px-4 text-sm font-medium text-brand"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
        {passwordError ? (
          <p id={`${passwordId}-error`} className="text-sm text-danger">
            {passwordError}
          </p>
        ) : isSignUp ? (
          <p id={`${passwordId}-hint`} className="text-sm text-muted">
            At least 8 characters.
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="button button-primary mt-1 w-full"
      >
        {isSignUp
          ? pending
            ? "Creating account…"
            : "Create account"
          : pending
            ? "Signing in…"
            : "Sign in"}
      </button>

      <p className="text-sm text-muted">
        {isSignUp ? (
          <>
            Already have an account? <Link href="/sign-in">Sign in</Link>
          </>
        ) : (
          <>
            New to IIUC Connect? <Link href="/sign-up">Create an account</Link>
          </>
        )}
      </p>
    </form>
  );
}
