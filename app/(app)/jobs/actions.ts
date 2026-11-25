"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { checkCv, cvPath } from "@/lib/jobs/cv";
import type { JobField, JobFormState } from "@/lib/jobs/form-state";
import { applySchema, decisionSchema, jobSchema } from "@/lib/jobs/schemas";
import { createClient } from "@/lib/supabase/server";

const idSchema = z.uuid();

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/jobs");
  return user;
}

function echo(formData: FormData, fields: readonly JobField[]) {
  const values: Partial<Record<JobField, string>> = {};
  for (const field of fields) {
    const value = formData.get(field);
    if (typeof value === "string") values[field] = value.slice(0, 3100);
  }
  return values;
}

function raw(formData: FormData, fields: readonly JobField[]) {
  return Object.fromEntries(fields.map((f) => [f, formData.get(f)]));
}

function invalid(error: z.ZodError, values: JobFormState["values"]): JobFormState {
  return {
    status: "error",
    message: "Some details need fixing. Check the fields marked below.",
    fieldErrors: z.flattenError(error).fieldErrors as JobFormState["fieldErrors"],
    values,
  };
}

/** Plain-language messages for the database's refusals. Never shows raw errors. */
function dbMessage(code: string | undefined, fallback: string): string {
  switch (code) {
    case "54000":
      return "You have reached a limit: 10 active jobs for a graduate, 20 live applications for a member.";
    case "42501":
      return "That is not possible. The job may be closed or your own, or you may not be verified.";
    case "23505":
      return "You have already applied to this job.";
    default:
      return fallback;
  }
}

function log(action: string, code: string | undefined) {
  if (!["54000", "42501", "23505"].includes(code ?? "")) {
    console.error(`${action} failed:`, code);
  }
}

const JOB_FIELDS = ["title", "company", "location", "jobType", "description"] as const;

/** A verified graduate posts a job. */
export async function postJob(
  _previous: JobFormState,
  formData: FormData,
): Promise<JobFormState> {
  await requireUser();
  const values = echo(formData, JOB_FIELDS);
  const parsed = jobSchema.safeParse(raw(formData, JOB_FIELDS));
  if (!parsed.success) return invalid(parsed.error, values);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .insert(parsed.data)
    .select("id")
    .single();
  if (error || !data) {
    log("post job", error?.code);
    return {
      status: "error",
      message: dbMessage(error?.code, "We could not post the job. Nothing was saved. Try again."),
      values,
    };
  }
  redirect(`/jobs/${data.id}?posted=1`);
}

const APPLY_FIELDS = ["jobId", "message"] as const;
const CV_BUCKET = "application-cvs";

/** A verified member applies to a job, once, with an optional PDF CV. */
export async function applyToJob(
  _previous: JobFormState,
  formData: FormData,
): Promise<JobFormState> {
  const user = await requireUser();
  const values = echo(formData, APPLY_FIELDS);
  const parsed = applySchema.safeParse(raw(formData, APPLY_FIELDS));
  const fieldErrors: NonNullable<JobFormState["fieldErrors"]> = parsed.success
    ? {}
    : (z.flattenError(parsed.error).fieldErrors as NonNullable<JobFormState["fieldErrors"]>);

  // The CV is optional. A chosen file is judged by its content, not by the name
  // or type the browser reports.
  const file = formData.get("cv");
  const upload = file instanceof File && file.size > 0 ? file : null;
  if (upload) {
    const head = new Uint8Array(await upload.slice(0, 16).arrayBuffer());
    const check = checkCv(upload.size, head);
    if (!check.ok) fieldErrors.cv = [check.message];
  }

  if (!parsed.success || Object.keys(fieldErrors).length > 0) {
    return {
      status: "error",
      message: "Some details need fixing. Check the fields marked below.",
      fieldErrors,
      values,
    };
  }

  const supabase = await createClient();

  // Upload first, then save the application, so an application never points at
  // a file that is not there. If saving fails after the upload, the file is left
  // with no application and the daily cleanup removes it.
  const applicationId = crypto.randomUUID();
  let path: string | null = null;
  if (upload) {
    path = cvPath(user.id, applicationId);
    const { error: uploadError } = await supabase.storage
      .from(CV_BUCKET)
      .upload(path, await upload.arrayBuffer(), {
        contentType: "application/pdf",
        upsert: false,
      });
    if (uploadError) {
      console.error("apply to job: could not upload the CV:", uploadError.message);
      return {
        status: "error",
        message:
          "We could not upload your CV, so nothing was sent. Choose the file again and try again.",
        values,
      };
    }
  }

  const { error } = await supabase
    .from("job_applications")
    .insert({ id: applicationId, ...parsed.data, cv_path: path });
  if (error) {
    log("apply to job", error.code);
    return {
      status: "error",
      message: dbMessage(error.code, "We could not send your application. Try again."),
      values,
    };
  }
  redirect(`/jobs/${parsed.data.job_id}?applied=1`);
}

/** The poster closes or reopens a job. */
export async function setJobStatus(formData: FormData) {
  await requireUser();
  const id = idSchema.safeParse(formData.get("jobId"));
  const status = z.enum(["active", "closed"]).safeParse(formData.get("status"));
  if (!id.success || !status.success) redirect("/jobs?problem=1");
  const supabase = await createClient();
  const { error } = await supabase.from("jobs").update({ status: status.data }).eq("id", id.data);
  if (error) {
    log("set job status", error.code);
    redirect(`/jobs/${id.data}?problem=${error.code === "54000" ? "limit" : "1"}`);
  }
  redirect(`/jobs/${id.data}?${status.data === "closed" ? "closed" : "reopened"}=1`);
}

/** The poster deletes a job and its applications. */
export async function deleteJob(formData: FormData) {
  await requireUser();
  const id = idSchema.safeParse(formData.get("jobId"));
  if (!id.success) redirect("/jobs?problem=1");
  const supabase = await createClient();
  const { error } = await supabase.from("jobs").delete().eq("id", id.data);
  if (error) {
    log("delete job", error.code);
    redirect(`/jobs/${id.data}?problem=1`);
  }
  redirect("/jobs?deleted=1");
}

/** The poster shortlists or rejects an application. */
export async function decideApplication(formData: FormData) {
  await requireUser();
  const parsed = decisionSchema.safeParse({
    applicationId: formData.get("applicationId"),
    decision: formData.get("decision"),
  });
  const jobId = idSchema.safeParse(formData.get("jobId"));
  if (!parsed.success || !jobId.success) redirect("/jobs?problem=1");
  const supabase = await createClient();
  const { error } = await supabase
    .from("job_applications")
    .update({ status: parsed.data.decision })
    .eq("id", parsed.data.applicationId);
  if (error) {
    log("decide application", error.code);
    redirect(`/jobs/${jobId.data}?problem=1`);
  }
  redirect(`/jobs/${jobId.data}?decided=1`);
}

/** An applicant withdraws their application. */
export async function withdrawApplication(formData: FormData) {
  await requireUser();
  const id = idSchema.safeParse(formData.get("applicationId"));
  if (!id.success) redirect("/jobs?problem=1");
  const supabase = await createClient();
  const { error } = await supabase
    .from("job_applications")
    .update({ status: "withdrawn" })
    .eq("id", id.data);
  if (error) {
    log("withdraw application", error.code);
    redirect("/jobs?problem=1");
  }
  redirect("/jobs?withdrawn=1");
}
