"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import type { MentorshipField, MentorshipFormState } from "@/lib/mentorship/form-state";
import {
  feedbackSchema,
  idSchema,
  mentorProfileSchema,
  outcomeSchema,
  requestSchema,
  respondSchema,
  ruleSchema,
} from "@/lib/mentorship/schemas";
import { createClient } from "@/lib/supabase/server";

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/sessions");
  return user;
}

/** What the member typed, trimmed to a safe length, so a failed form keeps its text. */
function echo(formData: FormData, fields: readonly MentorshipField[]) {
  const values: Partial<Record<MentorshipField, string>> = {};
  for (const field of fields) {
    const value = formData.get(field);
    if (typeof value === "string") values[field] = value.slice(0, 600);
  }
  return values;
}

function raw(formData: FormData, fields: readonly MentorshipField[]) {
  return Object.fromEntries(fields.map((f) => [f, formData.get(f)]));
}

function invalid(
  error: z.ZodError,
  values: MentorshipFormState["values"],
): MentorshipFormState {
  return {
    status: "error",
    message: "Some details need fixing. Check the fields marked below.",
    fieldErrors: z.flattenError(error).fieldErrors as MentorshipFormState["fieldErrors"],
    values,
  };
}

/** Plain-language messages for the database's refusals. Never shows raw errors. */
function dbMessage(code: string | undefined, fallback: string): string {
  switch (code) {
    case "54000":
      return "You have reached a limit: 3 live requests, the mentor's weekly sessions, or 10 weekly windows. Cancel one first.";
    case "42501":
      return "You are not allowed to do that.";
    case "22023":
      return "That is no longer possible. The slot may have been taken or the time has passed. Reload the page and check.";
    case "23505":
      return "You already have a pending request with this mentor, or the slot was just taken.";
    default:
      return fallback;
  }
}

function log(action: string, code: string | undefined) {
  if (!["54000", "42501", "22023", "23505"].includes(code ?? "")) {
    console.error(`${action} failed:`, code);
  }
}

const PROFILE_FIELDS = ["expertiseAreas", "bio", "maxSessions", "accepting"] as const;

/** A verified graduate creates or updates their mentor profile. */
export async function saveMentorProfile(
  _previous: MentorshipFormState,
  formData: FormData,
): Promise<MentorshipFormState> {
  const user = await requireUser();
  const values = echo(formData, PROFILE_FIELDS);
  const parsed = mentorProfileSchema.safeParse(raw(formData, PROFILE_FIELDS));
  if (!parsed.success) return invalid(parsed.error, values);

  const supabase = await createClient();
  const { data: updated, error: updateError } = await supabase
    .from("mentor_profiles")
    .update(parsed.data)
    .eq("id", user.id)
    .select("id");

  let code = updateError?.code;
  if (!updateError && updated.length === 0) {
    const { error } = await supabase.from("mentor_profiles").insert(parsed.data);
    code = error?.code;
  }

  if (code) {
    log("save mentor profile", code);
    return {
      status: "error",
      message: dbMessage(code, "We could not save your mentor profile. Nothing changed. Try again."),
      values,
    };
  }
  redirect("/sessions?saved=1");
}

const RULE_FIELDS = ["weekday", "startTime", "endTime"] as const;

/** A mentor adds one weekly availability window; slots appear at once. */
export async function addRule(
  _previous: MentorshipFormState,
  formData: FormData,
): Promise<MentorshipFormState> {
  await requireUser();
  const values = echo(formData, RULE_FIELDS);
  const parsed = ruleSchema.safeParse(raw(formData, RULE_FIELDS));
  if (!parsed.success) return invalid(parsed.error, values);

  const supabase = await createClient();
  const { error } = await supabase.from("mentor_availability_rules").insert(parsed.data);
  if (error) {
    log("add rule", error.code);
    return {
      status: "error",
      message:
        error.code === "23505"
          ? "You already have a window starting at that time on that day."
          : dbMessage(error.code, "We could not add the window. Nothing changed. Try again."),
      values,
    };
  }
  redirect("/sessions?rule=1");
}

/** A mentor removes a window; its future open slots are withdrawn. */
export async function removeRule(formData: FormData) {
  await requireUser();
  const id = idSchema.safeParse(formData.get("ruleId"));
  if (!id.success) redirect("/sessions?problem=1");
  const supabase = await createClient();
  const { error } = await supabase
    .from("mentor_availability_rules")
    .delete()
    .eq("id", id.data);
  if (error) {
    log("remove rule", error.code);
    redirect("/sessions?problem=1");
  }
  redirect("/sessions?ruleRemoved=1");
}

const REQUEST_FIELDS = ["slotId", "duration", "goal", "question1", "question2"] as const;

/** A verified member asks for an open slot. */
export async function requestSession(
  _previous: MentorshipFormState,
  formData: FormData,
): Promise<MentorshipFormState> {
  await requireUser();
  const values = echo(formData, REQUEST_FIELDS);
  const parsed = requestSchema.safeParse(raw(formData, REQUEST_FIELDS));
  if (!parsed.success) return invalid(parsed.error, values);

  const supabase = await createClient();
  const { error } = await supabase.from("mentorship_requests").insert(parsed.data);
  if (error) {
    log("request session", error.code);
    return {
      status: "error",
      message: dbMessage(error.code, "We could not send your request. Nothing was sent. Try again."),
      values,
    };
  }
  redirect("/sessions?requested=1");
}

const RESPOND_FIELDS = ["requestId", "decision", "meetingUrl"] as const;

/** A mentor accepts with a meeting link, or declines. */
export async function respondRequest(
  _previous: MentorshipFormState,
  formData: FormData,
): Promise<MentorshipFormState> {
  await requireUser();
  const values = echo(formData, RESPOND_FIELDS);
  const parsed = respondSchema.safeParse(raw(formData, RESPOND_FIELDS));
  if (!parsed.success) return invalid(parsed.error, values);

  const answer = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mentorship_requests")
    .update(
      answer.decision === "accept"
        ? { status: "accepted", meeting_url: answer.meetingUrl }
        : { status: "declined" },
    )
    .eq("id", answer.requestId)
    .eq("status", "pending")
    .select("id");

  if (error || data.length === 0) {
    log("respond request", error?.code);
    return {
      status: "error",
      message: error
        ? dbMessage(error.code, "We could not save your answer. Nothing changed. Try again.")
        : "This request is no longer waiting for an answer. It may have expired or been cancelled.",
      values,
    };
  }
  redirect(`/sessions?${answer.decision === "accept" ? "accepted" : "declined"}=1`);
}

/** Either side cancels: a mentee a pending or accepted request, a mentor an accepted one. */
export async function cancelRequest(formData: FormData) {
  await requireUser();
  const id = idSchema.safeParse(formData.get("requestId"));
  if (!id.success) redirect("/sessions?problem=1");
  const supabase = await createClient();
  const { error } = await supabase
    .from("mentorship_requests")
    .update({ status: "cancelled" })
    .eq("id", id.data)
    .in("status", ["pending", "accepted"]);
  if (error) {
    log("cancel request", error.code);
    redirect("/sessions?problem=1");
  }
  redirect("/sessions?cancelled=1");
}

/** The mentor closes a finished session as completed or no-show. */
export async function markOutcome(formData: FormData) {
  await requireUser();
  const parsed = outcomeSchema.safeParse({
    sessionId: formData.get("sessionId"),
    outcome: formData.get("outcome"),
  });
  if (!parsed.success) redirect("/sessions?problem=1");
  const supabase = await createClient();
  const { error } = await supabase
    .from("sessions")
    .update({ status: parsed.data.outcome })
    .eq("id", parsed.data.sessionId)
    .eq("status", "scheduled");
  if (error) {
    log("mark outcome", error.code);
    redirect("/sessions?problem=1");
  }
  redirect("/sessions?closed=1");
}

const FEEDBACK_FIELDS = ["sessionId", "rating", "comment"] as const;

/** Either person rates a completed session, once. */
export async function submitFeedback(
  _previous: MentorshipFormState,
  formData: FormData,
): Promise<MentorshipFormState> {
  await requireUser();
  const values = echo(formData, FEEDBACK_FIELDS);
  const parsed = feedbackSchema.safeParse(raw(formData, FEEDBACK_FIELDS));
  if (!parsed.success) return invalid(parsed.error, values);

  const supabase = await createClient();
  const { error } = await supabase.from("session_feedback").insert(parsed.data);
  if (error) {
    log("submit feedback", error.code);
    return {
      status: "error",
      message:
        error.code === "23505"
          ? "You have already rated this session."
          : dbMessage(error.code, "We could not save your rating. Nothing changed. Try again."),
      values,
    };
  }
  redirect("/sessions?rated=1");
}
