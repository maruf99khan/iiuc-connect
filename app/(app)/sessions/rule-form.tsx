"use client";

import { useActionState, useId } from "react";

import type { MentorshipField, MentorshipFormState } from "@/lib/mentorship/form-state";
import { TIME_OPTIONS, WEEKDAYS } from "@/lib/mentorship/schemas";

import { Field, aria } from "../field";

import { addRule } from "./actions";

const initialState: MentorshipFormState = { status: "idle" };

/** Adds one weekly window in Bangladesh time. */
export function RuleForm() {
  const [state, formAction, pending] = useActionState(addRule, initialState);
  const id = useId();
  const err = (f: MentorshipField) => state.fieldErrors?.[f]?.[0];

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.message ? (
        <p role="alert" className="text-sm leading-6 text-danger">
          {state.message}
        </p>
      ) : null}
      <Field id={`${id}-day`} label="Day" error={err("weekday")}>
        <select
          id={`${id}-day`}
          name="weekday"
          defaultValue={state.values?.weekday ?? "1"}
          {...aria(`${id}-day`, err("weekday"), false)}
          className="field"
        >
          {WEEKDAYS.map((name, i) => (
            <option key={name} value={String(i)}>
              {name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${id}-from`} label="From" hint="Bangladesh time" error={err("startTime")}>
          <select
            id={`${id}-from`}
            name="startTime"
            defaultValue={state.values?.startTime ?? "09:00"}
            {...aria(`${id}-from`, err("startTime"), true)}
            className="field"
          >
            {TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field id={`${id}-to`} label="To" hint="Bangladesh time" error={err("endTime")}>
          <select
            id={`${id}-to`}
            name="endTime"
            defaultValue={state.values?.endTime ?? "11:00"}
            {...aria(`${id}-to`, err("endTime"), true)}
            className="field"
          >
            {TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <button type="submit" disabled={pending} className="button button-primary self-start">
        {pending ? "Adding…" : "Add this window"}
      </button>
    </form>
  );
}
