"use client";

import Link from "next/link";
import { useActionState, useId } from "react";

import type { JobFormState } from "@/lib/jobs/form-state";

import { Field, aria } from "../field";

import { applyToJob } from "./actions";

const initialState: JobFormState = { status: "idle" };

/** A member applies to one job, with an optional message and an optional PDF CV. */
export function ApplyForm({
  jobId,
  profilePrivate,
}: {
  jobId: string;
  /** The applicant's profile is private, so the poster cannot open it. */
  profilePrivate: boolean;
}) {
  const [state, formAction, pending] = useActionState(applyToJob, initialState);
  const id = useId();
  const error = state.fieldErrors?.message?.[0];
  const cvError = state.fieldErrors?.cv?.[0];

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="jobId" value={jobId} />
      {state.message ? (
        <p role="alert" className="text-sm leading-6 text-danger">
          {state.message}
        </p>
      ) : null}
      {profilePrivate ? (
        <p
          role="note"
          className="rounded-xl border border-border bg-surface px-4 py-3 text-sm leading-6"
        >
          Your profile is set to private, so the poster cannot open it from your
          application. They will see your name, your message and your CV.{" "}
          <Link href="/profile">Change who can find you</Link>
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
      <Field
        id={`${id}-cv`}
        label="A CV (optional)"
        hint="A PDF up to 2 MB. Send a CV that fits this job. Only you and the person who posted the job can open it."
        error={cvError}
      >
        <input
          id={`${id}-cv`}
          name="cv"
          type="file"
          accept="application/pdf,.pdf"
          {...aria(`${id}-cv`, cvError, true)}
          className="field py-2"
        />
      </Field>
      <button type="submit" disabled={pending} className="button button-primary self-start">
        {pending ? "Sending…" : "Apply to this job"}
      </button>
    </form>
  );
}
