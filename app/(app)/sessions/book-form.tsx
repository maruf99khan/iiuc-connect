"use client";

import { useActionState, useId } from "react";

import type { SessionFormState } from "@/lib/sessions/form-state";

import { Field, aria } from "../field";

import { bookSlot } from "./actions";

const initialState: SessionFormState = { status: "idle" };

/** One slot's "book it" form, with an optional message to the mentor. */
export function BookSlotForm({ slotId }: { slotId: string }) {
  const [state, formAction, pending] = useActionState(bookSlot, initialState);
  const id = useId();
  const error = state.fieldErrors?.note?.[0];

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="slotId" value={slotId} />
      {state.message ? (
        <p role="alert" className="text-sm leading-6 text-danger">
          {state.message}
        </p>
      ) : null}
      <Field
        id={`${id}-note`}
        label="A short message (optional)"
        hint="Tell the mentor what you would like to talk about."
        error={error}
      >
        <textarea
          id={`${id}-note`}
          name="note"
          rows={2}
          maxLength={500}
          defaultValue={state.values?.note}
          {...aria(`${id}-note`, error, true)}
          className="field py-3"
        />
      </Field>
      <button
        type="submit"
        disabled={pending}
        className="button button-primary self-start"
      >
        {pending ? "Booking…" : "Book this session"}
      </button>
    </form>
  );
}
