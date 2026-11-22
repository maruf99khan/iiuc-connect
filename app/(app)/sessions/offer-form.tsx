"use client";

import { useActionState, useId } from "react";

import type { SessionFormState } from "@/lib/sessions/form-state";

import { Field, aria } from "../field";

import { offerSlot } from "./actions";

const initialState: SessionFormState = { status: "idle" };

export function OfferSlotForm() {
  const [state, formAction, pending] = useActionState(offerSlot, initialState);
  const id = useId();
  const errors = state.fieldErrors ?? {};
  const values = state.values ?? {};

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
        id={`${id}-start`}
        label="Date and time (Bangladesh time)"
        hint="Between 30 minutes and 60 days from now."
        error={errors.startsAt?.[0]}
      >
        <input
          id={`${id}-start`}
          name="startsAt"
          type="datetime-local"
          required
          defaultValue={values.startsAt}
          {...aria(`${id}-start`, errors.startsAt?.[0], true)}
          className="field"
        />
      </Field>

      <Field id={`${id}-dur`} label="Length" error={errors.duration?.[0]}>
        <select
          id={`${id}-dur`}
          name="duration"
          required
          defaultValue={values.duration ?? "30"}
          {...aria(`${id}-dur`, errors.duration?.[0], false)}
          className="field"
        >
          <option value="15">15 minutes</option>
          <option value="30">30 minutes</option>
        </select>
      </Field>

      <Field
        id={`${id}-topic`}
        label="What can you help with?"
        hint="For example: Getting your first backend job."
        error={errors.topic?.[0]}
      >
        <input
          id={`${id}-topic`}
          name="topic"
          type="text"
          required
          maxLength={120}
          defaultValue={values.topic}
          {...aria(`${id}-topic`, errors.topic?.[0], true)}
          className="field"
        />
      </Field>

      <Field
        id={`${id}-link`}
        label="Meeting link"
        hint="Starts with https://. Only you and the person who books can see it."
        error={errors.meetingUrl?.[0]}
      >
        <input
          id={`${id}-link`}
          name="meetingUrl"
          type="url"
          required
          maxLength={300}
          autoComplete="off"
          spellCheck={false}
          defaultValue={values.meetingUrl}
          {...aria(`${id}-link`, errors.meetingUrl?.[0], true)}
          className="field"
        />
      </Field>

      <button
        type="submit"
        disabled={pending}
        className="button button-primary w-full sm:w-auto sm:self-start"
      >
        {pending ? "Adding…" : "Add this slot"}
      </button>
    </form>
  );
}
