"use client";

import { useActionState, useId } from "react";

import type { MentorshipField, MentorshipFormState } from "@/lib/mentorship/form-state";

import { Field, aria } from "../field";

import { saveMentorProfile } from "./actions";

const initialState: MentorshipFormState = { status: "idle" };

type Profile = {
  expertise_areas: string[];
  bio: string | null;
  max_sessions_per_week: number;
  accepting_requests: boolean;
} | null;

/** A graduate's mentor settings: areas, a short bio, a weekly cap, and an on/off switch. */
export function MentorProfileForm({ profile }: { profile: Profile }) {
  const [state, formAction, pending] = useActionState(saveMentorProfile, initialState);
  const id = useId();
  const err = (f: MentorshipField) => state.fieldErrors?.[f]?.[0];
  const failed = state.status === "error";

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
      {state.message ? (
        <p role="alert" className="text-sm leading-6 text-danger">
          {state.message}
        </p>
      ) : null}
      <Field
        id={`${id}-areas`}
        label="Areas you can help with"
        hint="Separate with commas, up to 8."
        error={err("expertiseAreas")}
      >
        <input
          id={`${id}-areas`}
          name="expertiseAreas"
          defaultValue={state.values?.expertiseAreas ?? profile?.expertise_areas.join(", ")}
          {...aria(`${id}-areas`, err("expertiseAreas"), true)}
          className="field"
        />
      </Field>
      <Field id={`${id}-bio`} label="About you" error={err("bio")}>
        <textarea
          id={`${id}-bio`}
          name="bio"
          rows={3}
          maxLength={500}
          defaultValue={state.values?.bio ?? profile?.bio ?? ""}
          {...aria(`${id}-bio`, err("bio"), false)}
          className="field py-3"
        />
      </Field>
      <Field id={`${id}-max`} label="Most sessions per week" error={err("maxSessions")}>
        <select
          id={`${id}-max`}
          name="maxSessions"
          defaultValue={state.values?.maxSessions ?? String(profile?.max_sessions_per_week ?? 3)}
          {...aria(`${id}-max`, err("maxSessions"), false)}
          className="field"
        >
          {Array.from({ length: 10 }, (_, i) => String(i + 1)).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </Field>
      <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
        <input
          type="checkbox"
          name="accepting"
          defaultChecked={failed ? state.values?.accepting === "on" : (profile?.accepting_requests ?? true)}
          className="size-5"
        />
        I am taking requests
      </label>
      <button type="submit" disabled={pending} className="button button-primary self-start">
        {pending ? "Saving…" : "Save mentor profile"}
      </button>
    </form>
  );
}
