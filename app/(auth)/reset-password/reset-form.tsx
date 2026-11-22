"use client";

import { useActionState, useId } from "react";

import { Field, aria } from "@/app/(app)/field";
import type { RecoveryFormState } from "@/lib/auth/form-state";

import { updatePassword } from "../actions";

const initialState: RecoveryFormState = { status: "idle" };

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(
    updatePassword,
    initialState,
  );
  const id = useId();
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.message ? (
        <p
          role="alert"
          className="rounded-xl border border-danger px-4 py-3 text-sm leading-6 text-danger"
        >
          {state.message}
        </p>
      ) : null}

      <Field
        id={`${id}-password`}
        label="New password"
        hint="At least 8 characters."
        error={errors.password?.[0]}
      >
        <input
          id={`${id}-password`}
          name="password"
          type="password"
          required
          minLength={8}
          maxLength={72}
          autoComplete="new-password"
          {...aria(`${id}-password`, errors.password?.[0], true)}
          className="field"
        />
      </Field>

      <Field
        id={`${id}-confirm`}
        label="Type it again"
        error={errors.confirm?.[0]}
      >
        <input
          id={`${id}-confirm`}
          name="confirm"
          type="password"
          required
          maxLength={72}
          autoComplete="new-password"
          {...aria(`${id}-confirm`, errors.confirm?.[0], false)}
          className="field"
        />
      </Field>

      <button
        type="submit"
        disabled={pending}
        className="button button-primary w-full"
      >
        {pending ? "Saving…" : "Save new password"}
      </button>
    </form>
  );
}
