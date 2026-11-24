"use client";

import { useActionState, useId } from "react";

import type { JobFormState } from "@/lib/jobs/form-state";

import { Field, aria } from "../field";

import { applyToJob } from "./actions";

const initialState: JobFormState = { status: "idle" };

/** A member applies to one job, with an optional message. */
export function ApplyForm({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState(applyToJob, initialState);
  const id = useId();
  const error = state.fieldErrors?.message?.[0];

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="jobId" value={jobId} />
      {state.message ? (
        <p role="alert" className="text-sm leading-6 text-danger">
          {state.message}
        </p>
      ) : null}
      <Field
        id={`${id}-message`}
        label="A short message (optional)"
        hint="Say why you are a good fit. The poster sees your name and this message."
        error={error}
      >
        <textarea
          id={`${id}-message`}
          name="message"
          rows={4}
          maxLength={1000}
          defaultValue={state.values?.message}
          {...aria(`${id}-message`, error, true)}
          className="field py-3"
        />
      </Field>
      <button type="submit" disabled={pending} className="button button-primary self-start">
        {pending ? "Sending…" : "Apply to this job"}
      </button>
    </form>
  );
}
