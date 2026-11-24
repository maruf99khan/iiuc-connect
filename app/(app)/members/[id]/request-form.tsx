"use client";

import { useActionState, useId } from "react";

import type { MentorshipField, MentorshipFormState } from "@/lib/mentorship/form-state";
import { DURATIONS } from "@/lib/mentorship/schemas";

import { Field, aria } from "../../field";
import { requestSession } from "../../sessions/actions";

const initialState: MentorshipFormState = { status: "idle" };

/** Asks one slot of a graduate: a goal and one or two questions. */
export function RequestForm({ slotId }: { slotId: string }) {
  const [state, formAction, pending] = useActionState(requestSession, initialState);
  const id = useId();
  const err = (f: MentorshipField) => state.fieldErrors?.[f]?.[0];

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="slotId" value={slotId} />
      {state.message ? (
        <p role="alert" className="text-sm leading-6 text-danger">
          {state.message}
        </p>
      ) : null}
      <Field id={`${id}-duration`} label="Length" error={err("duration")}>
        <select
          id={`${id}-duration`}
          name="duration"
          defaultValue={state.values?.duration ?? "20"}
          {...aria(`${id}-duration`, err("duration"), false)}
          className="field"
        >
          {DURATIONS.map((d) => (
            <option key={d} value={d}>
              {d} minutes
            </option>
          ))}
        </select>
      </Field>
      <Field
        id={`${id}-goal`}
        label="What do you want from this session?"
        hint="At least 10 characters."
        error={err("goal")}
      >
        <textarea
          id={`${id}-goal`}
          name="goal"
          rows={3}
          maxLength={500}
          defaultValue={state.values?.goal}
          {...aria(`${id}-goal`, err("goal"), true)}
          className="field py-3"
        />
      </Field>
      <Field id={`${id}-q1`} label="Your first question" error={err("question1")}>
        <input
          id={`${id}-q1`}
          name="question1"
          maxLength={300}
          defaultValue={state.values?.question1}
          {...aria(`${id}-q1`, err("question1"), false)}
          className="field"
        />
      </Field>
      <Field id={`${id}-q2`} label="A second question (optional)" error={err("question2")}>
        <input
          id={`${id}-q2`}
          name="question2"
          maxLength={300}
          defaultValue={state.values?.question2}
          {...aria(`${id}-q2`, err("question2"), false)}
          className="field"
        />
      </Field>
      <button type="submit" disabled={pending} className="button button-primary self-start">
        {pending ? "Sending…" : "Request this session"}
      </button>
    </form>
  );
}
