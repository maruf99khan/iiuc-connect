"use client";

import Link from "next/link";
import { useActionState, useId } from "react";

import { Field, aria } from "@/app/(app)/field";
import type { RecoveryFormState } from "@/lib/auth/form-state";

import { requestPasswordReset } from "../actions";

const initialState: RecoveryFormState = { status: "idle" };

export function ForgotPasswordForm({ notice }: { notice?: string }) {
  const [state, formAction, pending] = useActionState(
    requestPasswordReset,
    initialState,
  );
  const id = useId();
  const error = state.fieldErrors?.email?.[0];

  if (state.status === "done") {
    return (
      <div role="status" className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Check your email</h2>
        <p className="leading-7 text-muted">
          If{" "}
          <span className="font-medium break-all text-foreground">
            {state.email}
          </span>{" "}
          has an account, we sent a link to choose a new password. It can take
          a few minutes, so check your spam folder too.
        </p>
        <Link href="/sign-in" className="self-start">
          Back to sign in
        </Link>
      </div>
    );
  }

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

      <Field id={`${id}-email`} label="Email" error={error}>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          required
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={state.email}
          {...aria(`${id}-email`, error, false)}
          className="field"
        />
      </Field>

      <button
        type="submit"
        disabled={pending}
        className="button button-primary w-full"
      >
        {pending ? "Sending…" : "Send reset link"}
      </button>

      <p className="text-sm text-muted">
        Remembered it? <Link href="/sign-in">Sign in</Link>
      </p>
    </form>
  );
}
