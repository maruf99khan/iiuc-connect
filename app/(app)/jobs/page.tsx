import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getCurrentUser } from "@/lib/auth/session";
import { JOB_TYPE_LABEL } from "@/lib/jobs/schemas";
import { createClient } from "@/lib/supabase/server";
import { isVerified } from "@/lib/verification/status";

import { withdrawApplication } from "./actions";

export const metadata: Metadata = { title: "Jobs" };

// Fixed messages looked up by code, so nothing from the URL is shown as text.
const NOTICES = {
  deleted: "Job deleted.",
  withdrawn: "Application withdrawn.",
} as const;

const LOAD_ERROR = "We could not load this. Reload the page.";

const APPLICATION_TEXT: Record<string, string> = {
  submitted: "Sent",
  shortlisted: "Shortlisted",
  rejected: "Not taken forward",
  withdrawn: "Withdrawn",
};

function postedOn(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Dhaka",
  });
}

export default function JobsPage({ searchParams }: PageProps<"/jobs">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading jobs…</p>}>
      <Jobs searchParams={searchParams} />
    </Suspense>
  );
}

async function Jobs({ searchParams }: Pick<PageProps<"/jobs">, "searchParams">) {
  const [params, user] = await Promise.all([searchParams, getCurrentUser()]);
  if (!user) redirect("/sign-in?next=/jobs");

  const supabase = await createClient();
  const [me, open, mine, applications] = await Promise.all([
    supabase
      .from("profiles")
      .select("affiliation, verification_status")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("jobs")
      .select("id, title, company, location, job_type, created_at")
      .eq("status", "active")
      .neq("poster_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("jobs")
      .select("id, title, status")
      .eq("poster_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("job_applications")
      .select("id, status, job:jobs(id, title, company)")
      .eq("applicant_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  for (const [name, result] of Object.entries({ me, open, mine, applications })) {
    if (result.error) console.error(`jobs page: ${name} failed:`, result.error.code);
  }

  const verified = !!me.data && isVerified(me.data.verification_status);
  const canPost =
    me.data?.affiliation === "alumni" &&
    (me.data.verification_status === "verified_alumni" ||
      me.data.verification_status === "trusted_member");

  const noticeKey = (Object.keys(NOTICES) as (keyof typeof NOTICES)[]).find(
    (key) => params[key] !== undefined,
  );

  return (
    <>
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-balance">Jobs</h1>
        <p className="max-w-prose leading-7 text-muted">
          Jobs and internships posted by verified IIUC graduates. Verified
          members can apply, and the graduate who posted it sees your name and message.
        </p>
        {canPost ? (
          <Link href="/jobs/new" className="button button-primary self-start">
            Post a job
          </Link>
        ) : null}
      </div>

      {noticeKey ? (
        <p
          role="status"
          className="rounded-xl border border-border bg-surface px-4 py-3 text-sm leading-6"
        >
          {NOTICES[noticeKey]}
        </p>
      ) : null}
      {params.problem !== undefined ? (
        <p
          role="alert"
          className="rounded-xl border border-border bg-surface px-4 py-3 text-sm leading-6 text-danger"
        >
          That did not work. Reload the page and try again.
        </p>
      ) : null}

      <section aria-labelledby="open-heading" className="flex flex-col gap-4">
        <h2 id="open-heading" className="text-xl font-semibold">
          Open jobs
        </h2>
        {open.error ? (
          <p role="alert" className="text-danger">
            {LOAD_ERROR}
          </p>
        ) : !verified ? (
          <p className="leading-7 text-muted">
            Jobs are for verified members. <Link href="/verify">Verify your affiliation</Link>
          </p>
        ) : (open.data ?? []).length === 0 ? (
          <p className="leading-7 text-muted">No open jobs yet. Check again soon.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border border-y border-border">
            {(open.data ?? []).map((job) => (
              <li key={job.id} className="flex flex-col gap-1 py-4">
                <Link href={`/jobs/${job.id}`} className="font-semibold break-words">
                  {job.title}
                </Link>
                <p className="break-words">
                  {job.company}
                  {job.location ? ` · ${job.location}` : ""}
                </p>
                <p className="text-sm text-muted">
                  {JOB_TYPE_LABEL[job.job_type]} · Posted {postedOn(job.created_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="applied-heading" className="flex flex-col gap-4">
        <h2 id="applied-heading" className="text-xl font-semibold">
          Your applications
        </h2>
        {applications.error ? (
          <p role="alert" className="text-danger">
            {LOAD_ERROR}
          </p>
        ) : (applications.data ?? []).length === 0 ? (
          <p className="leading-7 text-muted">You have not applied to a job yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border border-y border-border">
            {(applications.data ?? []).map((a) => (
              <li key={a.id} className="flex flex-col gap-2 py-4">
                {a.job ? (
                  <Link href={`/jobs/${a.job.id}`} className="font-semibold break-words">
                    {a.job.title} at {a.job.company}
                  </Link>
                ) : (
                  <p className="font-semibold">A job that is no longer open</p>
                )}
                <span className="self-start rounded-full border border-border px-2 py-0.5 text-xs">
                  {APPLICATION_TEXT[a.status] ?? a.status}
                </span>
                {a.status === "submitted" || a.status === "shortlisted" ? (
                  <form action={withdrawApplication}>
                    <input type="hidden" name="applicationId" value={a.id} />
                    <button type="submit" className="button button-quiet min-h-11 px-4 text-sm">
                      Withdraw
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {(mine.data ?? []).length > 0 ? (
        <section aria-labelledby="posted-heading" className="flex flex-col gap-4">
          <h2 id="posted-heading" className="text-xl font-semibold">
            Jobs you posted
          </h2>
          <ul className="flex flex-col divide-y divide-border border-y border-border">
            {(mine.data ?? []).map((job) => (
              <li key={job.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <Link href={`/jobs/${job.id}`} className="font-semibold break-words">
                  {job.title}
                </Link>
                <span className="rounded-full border border-border px-2 py-0.5 text-xs">
                  {job.status === "active" ? "Open" : "Closed"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
