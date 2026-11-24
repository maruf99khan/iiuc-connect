"use client";

import { useActionState, useId } from "react";

import type { ProfileFormState } from "@/lib/profile/form-state";
import {
  MAX_SKILLS,
  VISIBILITY_LABELS,
  VISIBILITY_OPTIONS,
} from "@/lib/profile/schema";

import { Field, aria } from "../field";

import { saveProfile } from "./actions";

export type ProfileValues = {
  fullName: string;
  headline: string;
  bio: string;
  jobTitle: string;
  company: string;
  location: string;
  industry: string;
  skills: string;
  linkedinUrl: string;
  portfolioUrl: string;
  githubUrl: string;
  visibility: (typeof VISIBILITY_OPTIONS)[number];
};

const initialState: ProfileFormState = { status: "idle" };

export function ProfileForm({
  initial,
  nameLocked,
}: {
  initial: ProfileValues;
  nameLocked: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    saveProfile,
    initialState,
  );
  const id = useId();
  const errors = state.fieldErrors ?? {};
  // After a failed save, show what the member typed rather than the saved copy.
  const value = <K extends keyof ProfileValues>(key: K): ProfileValues[K] =>
    (state.values?.[key] as ProfileValues[K] | undefined) ?? initial[key];

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

      {nameLocked ? null : (
        <Field
          id={`${id}-name`}
          label="Full name"
          hint="Once your affiliation is verified, your name is fixed."
          error={errors.fullName?.[0]}
        >
          <input
            id={`${id}-name`}
            name="fullName"
            type="text"
            required
            maxLength={120}
            autoComplete="name"
            defaultValue={value("fullName")}
            {...aria(`${id}-name`, errors.fullName?.[0], true)}
            className="field"
          />
        </Field>
      )}

      <Field
        id={`${id}-headline`}
        label="Headline"
        hint="One line, for example: Backend engineer at Acme."
        error={errors.headline?.[0]}
      >
        <input
          id={`${id}-headline`}
          name="headline"
          type="text"
          maxLength={160}
          defaultValue={value("headline")}
          {...aria(`${id}-headline`, errors.headline?.[0], true)}
          className="field"
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id={`${id}-job`} label="Job title" error={errors.jobTitle?.[0]}>
          <input
            id={`${id}-job`}
            name="jobTitle"
            type="text"
            maxLength={120}
            autoComplete="organization-title"
            defaultValue={value("jobTitle")}
            {...aria(`${id}-job`, errors.jobTitle?.[0], false)}
            className="field"
          />
        </Field>
        <Field id={`${id}-company`} label="Company" error={errors.company?.[0]}>
          <input
            id={`${id}-company`}
            name="company"
            type="text"
            maxLength={120}
            autoComplete="organization"
            defaultValue={value("company")}
            {...aria(`${id}-company`, errors.company?.[0], false)}
            className="field"
          />
        </Field>
        <Field id={`${id}-loc`} label="City" error={errors.location?.[0]}>
          <input
            id={`${id}-loc`}
            name="location"
            type="text"
            maxLength={120}
            autoComplete="address-level2"
            defaultValue={value("location")}
            {...aria(`${id}-loc`, errors.location?.[0], false)}
            className="field"
          />
        </Field>
        <Field id={`${id}-industry`} label="Industry" error={errors.industry?.[0]}>
          <input
            id={`${id}-industry`}
            name="industry"
            type="text"
            maxLength={80}
            defaultValue={value("industry")}
            {...aria(`${id}-industry`, errors.industry?.[0], false)}
            className="field"
          />
        </Field>
      </div>

      <Field
        id={`${id}-skills`}
        label="Skills"
        hint={`Separate with commas. Up to ${MAX_SKILLS}.`}
        error={errors.skills?.[0]}
      >
        <input
          id={`${id}-skills`}
          name="skills"
          type="text"
          defaultValue={value("skills")}
          {...aria(`${id}-skills`, errors.skills?.[0], true)}
          className="field"
        />
      </Field>

      <Field id={`${id}-bio`} label="About you" error={errors.bio?.[0]}>
        <textarea
          id={`${id}-bio`}
          name="bio"
          rows={5}
          maxLength={2000}
          defaultValue={value("bio")}
          {...aria(`${id}-bio`, errors.bio?.[0], false)}
          className="field py-3"
        />
      </Field>

      <Field
        id={`${id}-li`}
        label="LinkedIn address"
        hint="Optional. Starts with https://linkedin.com/"
        error={errors.linkedinUrl?.[0]}
      >
        <input
          id={`${id}-li`}
          name="linkedinUrl"
          type="url"
          maxLength={300}
          autoComplete="off"
          spellCheck={false}
          defaultValue={value("linkedinUrl")}
          {...aria(`${id}-li`, errors.linkedinUrl?.[0], true)}
          className="field"
        />
      </Field>

      <Field
        id={`${id}-gh`}
        label="GitHub address"
        hint="Optional. Starts with https://github.com/"
        error={errors.githubUrl?.[0]}
      >
        <input
          id={`${id}-gh`}
          name="githubUrl"
          type="url"
          maxLength={300}
          autoComplete="off"
          spellCheck={false}
          defaultValue={value("githubUrl")}
          {...aria(`${id}-gh`, errors.githubUrl?.[0], true)}
          className="field"
        />
      </Field>

      <Field
        id={`${id}-pf`}
        label="Portfolio or personal site"
        hint="Optional. A full address starting with https://. Job posters can open it from your profile."
        error={errors.portfolioUrl?.[0]}
      >
        <input
          id={`${id}-pf`}
          name="portfolioUrl"
          type="url"
          maxLength={300}
          autoComplete="off"
          spellCheck={false}
          defaultValue={value("portfolioUrl")}
          {...aria(`${id}-pf`, errors.portfolioUrl?.[0], true)}
          className="field"
        />
      </Field>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Who can find you</legend>
        {VISIBILITY_OPTIONS.map((option) => (
          <label
            key={option}
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--field-border)] px-4 py-3 has-[:checked]:border-brand has-[:checked]:bg-surface"
          >
            <input
              type="radio"
              name="visibility"
              value={option}
              required
              defaultChecked={value("visibility") === option}
              className="mt-1 size-4 accent-[var(--brand)]"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">
                {VISIBILITY_LABELS[option].title}
              </span>
              <span className="text-sm text-muted">
                {VISIBILITY_LABELS[option].detail}
              </span>
            </span>
          </label>
        ))}
        {errors.visibility?.[0] ? (
          <p className="text-sm text-danger">{errors.visibility[0]}</p>
        ) : null}
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        className="button button-primary mt-1 w-full sm:w-auto sm:self-start"
      >
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
