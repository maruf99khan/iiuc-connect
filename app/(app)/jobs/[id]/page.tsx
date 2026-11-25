import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { Avatar } from "@/components/ui/avatar";
import { Badge, type Tone } from "@/components/ui/badge";
import { SidePanelLayout } from "@/components/ui/browse";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState, Skeleton } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icons";
import { getCurrentUser } from "@/lib/auth/session";
import { JOB_TYPE_LABEL } from "@/lib/jobs/schemas";
import { createClient } from "@/lib/supabase/server";
import { relativeTime } from "@/lib/ui/format";
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

const APPLICATION: Record<string, { text: string; tone: Tone }> = {
  submitted: { text: "Sent", tone: "neutral" },
  shortlisted: { text: "Shortlisted", tone: "brand" },
  rejected: { text: "Not taken forward", tone: "danger" },
  withdrawn: { text: "Withdrawn", tone: "neutral" },
};

export default function JobPage({ params, searchParams }: PageProps<"/jobs/[id]">) {
  return (
    <Suspense fallback={<JobSkeleton />}>
      <Job params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function JobSkeleton() {
  return (
    <>
      <Skeleton className="h-36 rounded-2xl" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-10">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    </>
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
    supabase
      .from("profiles")
      .select("verification_status, visibility")
      .eq("id", user.id)
      .maybeSingle(),
    // Row Level Security: the poster sees every application, anyone else only their own.
    supabase
      .from("job_applications")
      .select(
        "id, status, message, cv_path, applicant_id, applicant:profiles!job_applications_applicant_id_fkey(full_name, visibility)",
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

  const header = (
    <Card className="flex flex-col gap-5 sm:flex-row sm:items-start">
      <Avatar id={job.company} name={job.company} size={96} />
      <div className="flex min-w-0 flex-col gap-3">
        <div>
          <h1 className="text-3xl font-extrabold break-words sm:text-4xl">{job.title}</h1>
          <p className="mt-1 text-lg break-words text-muted">{job.company}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
          <Badge tone="ink">{JOB_TYPE_LABEL[job.job_type]}</Badge>
          {job.status === "closed" ? <Badge tone="warn">Closed</Badge> : null}
          {job.location ? (
            <span className="inline-flex items-center gap-1">
              <Icon name="map-pin" className="size-4" />
              {job.location}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <Icon name="user" className="size-4" />
            Posted by {job.poster?.full_name || "a verified graduate"}, {relativeTime(job.created_at)}
          </span>
        </div>
      </div>
    </Card>
  );

  const about = (
    <section aria-labelledby="about-heading">
      <Card className="flex flex-col gap-3">
        <h2 id="about-heading" className="text-xl font-bold">
          About the job
        </h2>
        <p className="max-w-prose leading-7 break-words whitespace-pre-line">{job.description}</p>
      </Card>
    </section>
  );

  const back = <Link href="/jobs">Back to jobs</Link>;

  const notices = (
    <>
      {noticeKey ? <Alert tone="success">{NOTICES[noticeKey]}</Alert> : null}
      {query.problem !== undefined ? (
        <Alert tone="danger">
          {limitProblem
            ? "You already have 10 active jobs. Close one first."
            : "That did not work. Reload the page and try again."}
        </Alert>
      ) : null}
    </>
  );

  if (isPoster) {
    const panel = (
      <section aria-labelledby="manage-heading" className="flex flex-col gap-4">
        <h2 id="manage-heading" className="text-lg font-bold">
          Manage this job
        </h2>
        <form action={setJobStatus}>
          <input type="hidden" name="jobId" value={job.id} />
          <input type="hidden" name="status" value={job.status === "active" ? "closed" : "active"} />
          <button type="submit" className="button button-quiet w-full">
            {job.status === "active" ? "Close this job" : "Reopen this job"}
          </button>
        </form>
        <details className="flex flex-col gap-3">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-danger">
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
    );

    return (
      <>
        {header}
        {notices}
        <SidePanelLayout panel={panel} panelLabel="Manage this job">
          {about}
          <section aria-labelledby="applicants-heading" className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="applicants-heading" className="text-xl font-bold">
                Applications
              </h2>
              {applications.error ? null : (
                <p className="text-sm font-semibold text-muted tabular-nums">{list.length} received</p>
              )}
            </div>
            {applications.error ? (
              <Alert tone="danger">We could not load this. Reload the page.</Alert>
            ) : list.length === 0 ? (
              <EmptyState icon="users" title="No applications yet." description="They will appear here as members apply." />
            ) : (
              <ul className="flex flex-col gap-4">
                {list.map((a) => {
                  const state = APPLICATION[a.status] ?? { text: a.status, tone: "neutral" as Tone };
                  const name = a.applicant?.full_name || "A verified member";
                  const hidden = !a.applicant || a.applicant.visibility === "private";
                  return (
                    <Card as="li" key={a.id} className="flex flex-col gap-3">
                      <div className="flex items-center gap-3">
                        <Avatar id={a.applicant_id} name={name} size={40} />
                        <p className="min-w-0 font-bold break-words">
                          {hidden ? name : <Link href={`/members/${a.applicant_id}`}>{name}</Link>}
                        </p>
                        <span className="ml-auto">
                          <Badge tone={state.tone}>{state.text}</Badge>
                        </span>
                      </div>
                      {hidden ? <p className="text-xs text-muted">This member keeps their profile private.</p> : null}
                      {a.message ? (
                        <p className="break-words whitespace-pre-line">{a.message}</p>
                      ) : (
                        <p className="text-muted">No message.</p>
                      )}
                      {a.status === "withdrawn" ? null : a.cv_path ? (
                        <a
                          href={`/jobs/${job.id}/cv/${a.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-11 items-center gap-2 self-start text-sm"
                        >
                          <Icon name="link" className="size-4" />
                          Open CV (PDF, opens in a new tab)
                        </a>
                      ) : (
                        <p className="text-sm text-muted">No CV attached.</p>
                      )}
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
                              <button
                                type="submit"
                                className={`button min-h-11 px-4 text-sm ${decision === "shortlisted" ? "button-primary" : "button-quiet"}`}
                              >
                                {decision === "shortlisted" ? "Shortlist" : "Not this time"}
                              </button>
                            </form>
                          ))}
                        </div>
                      ) : null}
                    </Card>
                  );
                })}
              </ul>
            )}
          </section>
          {back}
        </SidePanelLayout>
      </>
    );
  }

  const panel = (
    <section aria-labelledby="apply-heading" className="flex flex-col gap-4">
      <h2 id="apply-heading" className="text-lg font-bold">
        Apply
      </h2>
      {mine ? (
        <>
          <p className="flex items-center gap-2">
            Your application:{" "}
            <Badge tone={(APPLICATION[mine.status] ?? { tone: "neutral" as Tone }).tone}>
              {APPLICATION[mine.status]?.text ?? mine.status}
            </Badge>
          </p>
          {mine.cv_path ? (
            <p className="text-sm">
              CV attached.{" "}
              <a href={`/jobs/${job.id}/cv/${mine.id}`} target="_blank" rel="noopener noreferrer">
                Open it (PDF, opens in a new tab)
              </a>
            </p>
          ) : null}
          {mine.status === "submitted" || mine.status === "shortlisted" ? (
            <form action={withdrawApplication}>
              <input type="hidden" name="applicationId" value={mine.id} />
              <button type="submit" className="button button-quiet w-full">
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
        <ApplyForm jobId={job.id} profilePrivate={me.data?.visibility === "private"} />
      )}
    </section>
  );

  return (
    <>
      {header}
      {notices}
      <SidePanelLayout panel={panel} panelLabel="Apply">
        {about}
        {back}
      </SidePanelLayout>
    </>
  );
}
