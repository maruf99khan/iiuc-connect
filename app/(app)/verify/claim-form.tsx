"use client";

import { useActionState, useId, useState } from "react";

import {
  DOCUMENT_KINDS,
  DOCUMENT_KIND_LABELS,
  EVIDENCE_MAX_BYTES,
} from "@/lib/verification/claim";
import type { ClaimFormState } from "@/lib/verification/form-state";

import { Field, aria } from "../field";

import { submitClaim } from "./actions";

const initialState: ClaimFormState = { status: "idle" };

export function ClaimForm({ defaultName }: { defaultName: string }) {
  const [state, formAction, pending] = useActionState(
    submitClaim,
    initialState,
  );
  const id = useId();
  const values = state.values ?? {};
  const errors = state.fieldErrors ?? {};
  // Kept in state so the graduation-year field follows the choice.
  const [affiliation, setAffiliation] = useState(values.affiliation ?? "student");

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
        id={`${id}-name`}
        label="Full name"
        hint="As it appears on your document."
        error={errors.fullName?.[0]}
      >
        <input
          id={`${id}-name`}
          name="fullName"
          type="text"
          required
          maxLength={120}
          autoComplete="name"
          defaultValue={values.fullName ?? defaultName}
          {...aria(`${id}-name`, errors.fullName?.[0], true)}
          className="field"
        />
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">I am</legend>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["student", "A current student"],
              ["alumni", "A graduate"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-[var(--field-border)] px-4 has-[:checked]:border-brand has-[:checked]:bg-surface"
            >
              <input
                type="radio"
                name="affiliation"
                value={value}
                required
                checked={affiliation === value}
                onChange={() => setAffiliation(value)}
                className="size-4 accent-[var(--brand)]"
              />
              <span className="text-sm font-medium">{label}</span>
            </label>
          ))}
        </div>
        {errors.affiliation?.[0] ? (
          <p className="text-sm text-danger">{errors.affiliation[0]}</p>
        ) : null}
      </fieldset>

      <Field
        id={`${id}-sid`}
        label="Student ID"
        error={errors.studentId?.[0]}
      >
        <input
          id={`${id}-sid`}
          name="studentId"
          type="text"
          required
          maxLength={20}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          defaultValue={values.studentId}
          {...aria(`${id}-sid`, errors.studentId?.[0], false)}
          className="field"
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id={`${id}-dept`}
          label="Department"
          error={errors.department?.[0]}
        >
          <input
            id={`${id}-dept`}
            name="department"
            type="text"
            required
            maxLength={80}
            autoComplete="off"
            defaultValue={values.department}
            {...aria(`${id}-dept`, errors.department?.[0], false)}
            className="field"
          />
        </Field>
        <Field id={`${id}-batch`} label="Batch" error={errors.batch?.[0]}>
          <input
            id={`${id}-batch`}
            name="batch"
            type="text"
            required
            maxLength={20}
            autoComplete="off"
            defaultValue={values.batch}
            {...aria(`${id}-batch`, errors.batch?.[0], false)}
            className="field"
          />
        </Field>
      </div>

      {affiliation === "alumni" ? (
        <Field
          id={`${id}-year`}
          label="Year you graduated"
          error={errors.graduationYear?.[0]}
        >
          <input
            id={`${id}-year`}
            name="graduationYear"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{4}"
            required
            maxLength={4}
            autoComplete="off"
            defaultValue={values.graduationYear}
            {...aria(`${id}-year`, errors.graduationYear?.[0], false)}
            className="field"
          />
        </Field>
      ) : null}

      <Field
        id={`${id}-kind`}
        label="Document"
        error={errors.documentKind?.[0]}
      >
        <select
          id={`${id}-kind`}
          name="documentKind"
          required
          defaultValue={values.documentKind ?? "student_id_card"}
          {...aria(`${id}-kind`, errors.documentKind?.[0], false)}
          className="field"
        >
          {DOCUMENT_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {DOCUMENT_KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </Field>

      <Field
        id={`${id}-file`}
        label="Photo or scan"
        hint={`JPG, PNG, WebP or PDF, up to ${EVIDENCE_MAX_BYTES / 1024 / 1024} MB. Only you and IIUC Connect admins can see it.${state.status === "error" ? " Choose the file again." : ""}`}
        error={errors.document?.[0]}
      >
        <input
          id={`${id}-file`}
          name="document"
          type="file"
          required
          accept="image/jpeg,image/png,image/webp,application/pdf"
          {...aria(`${id}-file`, errors.document?.[0], true)}
          className="field py-3 file:mr-4 file:rounded-lg file:border-0 file:bg-surface file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground"
        />
      </Field>

      <button
        type="submit"
        disabled={pending}
        className="button button-primary mt-1 w-full sm:w-auto sm:self-start"
      >
        {pending ? "Sending…" : "Send for review"}
      </button>
    </form>
  );
}
