"use client";

import { useActionState, useId } from "react";

import type { MentorshipField, MentorshipFormState } from "@/lib/mentorship/form-state";

import { Field, aria } from "../field";

import { respondRequest } from "./actions";

const initialState: MentorshipFormState = { status: "idle" };

/** A mentor answers a request: accept with a meeting link, or decline. */
export function RespondForm({ requestId }: { requestId: string }) {
  const [state, formAction, pending] = useActionState(respondRequest, initialState);
  const id = useId();
  const err = (f: MentorshipField) => state.fieldErrors?.[f]?.[0];

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="requestId" value={requestId} />
      {state.message ? (
        <p role="alert" className="text-sm leading-6 text-danger">
          {state.message}
        </p>
      ) : null}
      <Field
        id={`${id}-url`}
        label="Meeting link"
        hint="Needed to accept. Must start with https://"
        error={err("meetingUrl")}
      >
        <input
          id={`${id}-url`}
          name="meetingUrl"
          type="url"
          maxLength={300}
          defaultValue={state.values?.meetingUrl}
          {...aria(`${id}-url`, err("meetingUrl"), true)}
          className="field"
        />
      </Field>
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          name="decision"
          value="accept"
          disabled={pending}
          className="button button-primary"
        >
          Accept
        </button>
        <button
          type="submit"
          name="decision"
          value="decline"
          disabled={pending}
          className="button button-quiet"
        >
          Decline
        </button>
      </div>
    </form>
  );
}
