"use client";

import { useActionState } from "react";

import type { RecoveryFormState } from "@/lib/auth/form-state";

import { resendConfirmation } from "./actions";

const initialState: RecoveryFormState = { status: "idle" };

/** Asks for the sign-up confirmation email again. Sits outside any other form. */
export function ResendConfirmation({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(
    resendConfirmation,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="email" value={email} />
      {state.status === "done" ? (
        <p role="status" className="text-sm leading-6 text-muted">
          If that address has an account waiting to be confirmed, we sent a new
          link. It can take a few minutes.
        </p>
      ) : null}
      {state.status === "error" && state.message ? (
        <p role="alert" className="text-sm leading-6 text-danger">
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="button button-quiet self-start"
      >
        {pending ? "Sending…" : "Send the confirmation email again"}
      </button>
    </form>
  );
}
