"use client";

import { useActionState, useId } from "react";

import type { DecisionFormState } from "@/lib/verification/form-state";

import { decideClaim } from "./actions";

const initialState: DecisionFormState = { status: "idle" };

export function DecisionForm({ requestId }: { requestId: string }) {
  const [state, formAction, pending] = useActionState(
    decideClaim,
    initialState,
  );
  const id = useId();

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="requestId" value={requestId} />

      {state.message ? (
        <p
          role="alert"
          className="rounded-xl border border-danger px-4 py-3 text-sm leading-6 text-danger"
        >
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-notes`} className="text-sm font-medium">
          Note to the member
        </label>
        <textarea
          id={`${id}-notes`}
          name="notes"
          rows={2}
          maxLength={1000}
          aria-describedby={`${id}-notes-hint`}
          className="field py-3"
        />
        <p id={`${id}-notes-hint`} className="text-sm text-muted">
          Required when you reject. The member will see it.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="submit"
          name="decision"
          value="approve"
          disabled={pending}
          className="button button-primary"
        >
          Approve
        </button>
        <button
          type="submit"
          name="decision"
          value="reject"
          disabled={pending}
          className="button button-quiet"
        >
          Reject
        </button>
      </div>
    </form>
  );
}
