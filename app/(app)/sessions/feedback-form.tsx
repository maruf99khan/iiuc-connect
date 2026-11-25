"use client";

import { useActionState, useId } from "react";

import type { MentorshipField, MentorshipFormState } from "@/lib/mentorship/form-state";

import { Field, aria } from "../field";

import { submitFeedback } from "./actions";

const initialState: MentorshipFormState = { status: "idle" };

/** Rates a completed session from 1 to 5, with an optional comment. */
export function FeedbackForm({ sessionId }: { sessionId: string }) {
  const [state, formAction, pending] = useActionState(submitFeedback, initialState);
  const id = useId();
  const err = (f: MentorshipField) => state.fieldErrors?.[f]?.[0];

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="sessionId" value={sessionId} />
      {state.message ? (
        <p role="alert" className="text-sm leading-6 text-danger">
          {state.message}
        </p>
      ) : null}
      <fieldset
        className="flex flex-col gap-2"
        aria-describedby={err("rating") ? `${id}-rating-error` : undefined}
      >
        <legend className="text-sm font-medium">Rating</legend>
        <div className="flex flex-wrap gap-2">
          {["1", "2", "3", "4", "5"].map((n) => (
            <label
              key={n}
              className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border px-3 text-sm"
            >
              <input
                type="radio"
                name="rating"
                value={n}
                defaultChecked={state.values?.rating === n}
                required
              />
              {n}
            </label>
          ))}
        </div>
        {err("rating") ? (
          <p id={`${id}-rating-error`} role="alert" className="text-sm text-danger">
            {err("rating")}
          </p>
        ) : null}
      </fieldset>
      <Field id={`${id}-comment`} label="A short comment (optional)" error={err("comment")}>
        <textarea
          id={`${id}-comment`}
          name="comment"
          rows={2}
          maxLength={500}
          defaultValue={state.values?.comment}
          {...aria(`${id}-comment`, err("comment"), false)}
          className="field py-3"
        />
      </Field>
      <button type="submit" disabled={pending} className="button button-primary self-start">
        {pending ? "Sending…" : "Send rating"}
      </button>
    </form>
  );
}
