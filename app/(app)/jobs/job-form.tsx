"use client";

import { useActionState, useId } from "react";

import type { JobField, JobFormState } from "@/lib/jobs/form-state";
import { JOB_TYPES, JOB_TYPE_LABEL } from "@/lib/jobs/schemas";

import { Field, aria } from "../field";

import { postJob } from "./actions";

const initialState: JobFormState = { status: "idle" };

/** A graduate posts a job. */
export function JobForm() {
  const [state, formAction, pending] = useActionState(postJob, initialState);
  const id = useId();
  const err = (f: JobField) => state.fieldErrors?.[f]?.[0];

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.message ? (
        <p role="alert" className="text-sm leading-6 text-danger">
          {state.message}
        </p>
      ) : null}
      <Field id={`${id}-title`} label="Job title" error={err("title")}>
        <input
          id={`${id}-title`}
          name="title"
          maxLength={120}
          defaultValue={state.values?.title}
          {...aria(`${id}-title`, err("title"), false)}
          className="field"
        />
      </Field>
      <Field id={`${id}-company`} label="Company" error={err("company")}>
        <input
          id={`${id}-company`}
          name="company"
          maxLength={120}
          defaultValue={state.values?.company}
          {...aria(`${id}-company`, err("company"), false)}
          className="field"
        />
      </Field>
      <Field id={`${id}-location`} label="Location (optional)" error={err("location")}>
        <input
          id={`${id}-location`}
          name="location"
          maxLength={120}
          defaultValue={state.values?.location}
          {...aria(`${id}-location`, err("location"), false)}
          className="field"
        />
      </Field>
      <Field id={`${id}-type`} label="Type" error={err("jobType")}>
        <select
          id={`${id}-type`}
          name="jobType"
          defaultValue={state.values?.jobType ?? "full_time"}
          {...aria(`${id}-type`, err("jobType"), false)}
          className="field"
        >
          {JOB_TYPES.map((t) => (
            <option key={t} value={t}>
              {JOB_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </Field>
      <Field
        id={`${id}-description`}
        label="About the job"
        hint="At least 20 characters. Say what the work is and who it suits."
        error={err("description")}
      >
        <textarea
          id={`${id}-description`}
          name="description"
          rows={6}
          maxLength={3000}
          defaultValue={state.values?.description}
          {...aria(`${id}-description`, err("description"), true)}
          className="field py-3"
        />
      </Field>
      <button type="submit" disabled={pending} className="button button-primary self-start">
        {pending ? "Posting…" : "Post this job"}
      </button>
    </form>
  );
}
