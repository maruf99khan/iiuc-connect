import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { JOB_TYPE_LABEL } from "@/lib/jobs/schemas";
import { createClient } from "@/lib/supabase/server";
import { isVerified } from "@/lib/verification/status";

import { decideApplication, deleteJob, setJobStatus, withdrawApplication } from "../actions";
import { ApplyForm } from "../apply-form";

export const metadata: Metadata = { title: "Job" };

// Fixed messages looked up by code, so nothing from the URL is shown as text.
const NOTICES = {
  posted: "Job posted. Verified members can now see it and apply.",
  applied: "Application sent.",
  closed: "Job closed. It no longer appears to other members.",
  reopened: "Job reopened.",
  decided: "Saved.",
} as const;

const APPLICATION_TEXT: Record<string, string> = {
  submitted: "Sent",
  shortlisted: "Shortlisted",
  rejected: "Not taken forward",
  withdrawn: "Withdrawn",
};

export default function JobPage({ params, searchParams }: PageProps<"/jobs/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Job params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Job({
  params,
  searchParams,
}: Pick<PageProps<"/jobs/[id]">, "params" | "searchParams">) {
  const [{ id }, query, user] = await Promise.all([params, searchParams, getCurrentUser()]);
  if (!user) redirect(`/sign-in?next=/jobs/${encodeURIComponent(id)}`);
  if (!z.uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const [jobResult, me, applications] = await Promise.all([
    supabase
      .from("jobs")
      .select(
        "id, poster_id, title, company, location, job_type, description, status, created_at, poster:profiles!jobs_poster_id_fkey(full_name)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("profiles").select("verification_status").eq("id", user.id).maybeSingle(),
    // Row Level Security: the poster sees every application, anyone else only their own.
    supabase
      .from("job_applications")
      .select(
        "id, status, message, applicant_id, applicant:profiles!job_applications_applicant_id_fkey(full_name)",
      )
      .eq("job_id", id)
      .order("created_at"),
  ]);

  if (jobResult.error) console.error("job page: job failed:", jobResult.error.code);
  const job = jobResult.data;
  if (!job) notFound();

  const verified = !!me.data && isVerified(me.data.verification_status);
  const isPoster = job.poster_id === user.id;
  const list = applications.data ?? [];
  const mine = list.find((a) => a.applicant_id === user.id);

  const noticeKey = (Object.keys(NOTICES) as (keyof typeof NOTICES)[]).find(
    (key) => query[key] !== undefined,
  );
  const limitProblem = query.problem === "limit";

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-balance break-words">{job.title}</h1>
        <p className="break-words">
          {job.company}
          {job.location ? ` · ${job.location}` : ""}
        </p>
        <p className="text-sm text-muted">
          {JOB_TYPE_LABEL[job.job_type]} · Posted by{" "}
          {job.poster?.full_name || "a verified graduate"}
          {job.status === "closed" ? " · Closed" : ""}
        </p>
      </div>

      {noticeKey ? (
        <p
          role="status"
          className="rounded-xl border border-border bg-surface px-4 py-3 text-sm leading-6"
        >
          {NOTICES[noticeKey]}
        </p>
      ) : null}
      {query.problem !== undefined ? (
        <p
          role="alert"
          className="rounded-xl border border-border bg-surface px-4 py-3 text-sm leading-6 text-danger"
        >
          {limitProblem
            ? "You already have 10 active jobs. Close one first."
            : "That did not work. Reload the page and try again."}
        </p>
      ) : null}

      <section aria-labelledby="about-heading" className="flex flex-col gap-2">
        <h2 id="about-heading" className="text-lg font-semibold">
          About the job
        </h2>
        <p className="max-w-prose leading-7 break-words whitespace-pre-line">{job.description}</p>
      </section>

      {isPoster ? (
        <>
          <section aria-labelledby="manage-heading" className="flex flex-col gap-3">
            <h2 id="manage-heading" className="text-lg font-semibold">
              Manage this job
            </h2>
            <div className="flex flex-wrap gap-3">
              <form action={setJobStatus}>
                <input type="hidden" name="jobId" value={job.id} />
                <input
                  type="hidden"
                  name="status"
                  value={job.status === "active" ? "closed" : "active"}
                />
                <button type="submit" className="button button-quiet min-h-11 px-4 text-sm">
                  {job.status === "active" ? "Close this job" : "Reopen this job"}
                </button>
              </form>
            </div>
            <details className="flex flex-col gap-3">
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
                Delete this job
              </summary>
              <form action={deleteJob} className="flex flex-col gap-3 pt-2">
                <input type="hidden" name="jobId" value={job.id} />
                <p className="text-sm leading-6 text-muted">
                  This removes the job and every application to it. It cannot be undone.
                </p>
                <button type="submit" className="button button-quiet min-h-11 self-start px-4 text-sm">
                  Yes, delete this job
                </button>
              </form>
            </details>
          </section>

          <section aria-labelledby="applicants-heading" className="flex flex-col gap-4">
            <h2 id="applicants-heading" className="text-lg font-semibold">
              Applications
            </h2>
            {applications.error ? (
              <p role="alert" className="text-danger">
                We could not load this. Reload the page.
              </p>
            ) : list.length === 0 ? (
              <p className="leading-7 text-muted">No applications yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border border-y border-border">
                {list.map((a) => (
                  <li key={a.id} className="flex flex-col gap-2 py-4">
                    <p className="font-semibold break-words">
                      {a.applicant?.full_name || "A verified member"}
                    </p>
                    {a.message ? (
                      <p className="text-sm break-words whitespace-pre-line">{a.message}</p>
                    ) : (
                      <p className="text-sm text-muted">No message.</p>
                    )}
                    <span className="self-start rounded-full border border-border px-2 py-0.5 text-xs">
                      {APPLICATION_TEXT[a.status] ?? a.status}
                    </span>
                    {a.status === "submitted" || a.status === "shortlisted" ? (
                      <div className="flex flex-wrap gap-3">
                        {(a.status === "submitted"
                          ? (["shortlisted", "rejected"] as const)
                          : (["rejected"] as const)
                        ).map((decision) => (
                          <form action={decideApplication} key={decision}>
                            <input type="hidden" name="jobId" value={job.id} />
                            <input type="hidden" name="applicationId" value={a.id} />
                            <input type="hidden" name="decision" value={decision} />
                            <button type="submit" className="button button-quiet min-h-11 px-4 text-sm">
                              {decision === "shortlisted" ? "Shortlist" : "Not this time"}
                            </button>
                          </form>
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : (
        <section aria-labelledby="apply-heading" className="flex flex-col gap-3">
          <h2 id="apply-heading" className="text-lg font-semibold">
            Apply
          </h2>
          {mine ? (
            <>
              <p>
                Your application:{" "}
                <span className="rounded-full border border-border px-2 py-0.5 text-xs">
                  {APPLICATION_TEXT[mine.status] ?? mine.status}
                </span>
              </p>
              {mine.status === "submitted" || mine.status === "shortlisted" ? (
                <form action={withdrawApplication}>
                  <input type="hidden" name="applicationId" value={mine.id} />
                  <button type="submit" className="button button-quiet min-h-11 px-4 text-sm">
                    Withdraw
                  </button>
                </form>
              ) : null}
            </>
          ) : !verified ? (
            <p className="text-muted">
              Only verified members can apply. <Link href="/verify">Verify your affiliation</Link>
            </p>
          ) : job.status === "closed" ? (
            <p className="text-muted">This job is closed.</p>
          ) : (
            <ApplyForm jobId={job.id} />
          )}
        </section>
      )}

      <Link href="/jobs" className="self-start">
        Back to jobs
      </Link>
    </>
  );
}
