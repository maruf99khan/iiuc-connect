import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge, type Tone } from "@/components/ui/badge";
import { SidePanelLayout } from "@/components/ui/browse";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState, Skeleton } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { JOB_TYPE_LABEL } from "@/lib/jobs/schemas";
import { createClient } from "@/lib/supabase/server";
import { relativeTime } from "@/lib/ui/format";
import { isVerified } from "@/lib/verification/status";

import { withdrawApplication } from "./actions";

export const metadata: Metadata = { title: "Jobs" };

// Fixed messages looked up by code, so nothing from the URL is shown as text.
const NOTICES = {
  deleted: "Job deleted.",
  withdrawn: "Application withdrawn.",
} as const;

const LOAD_ERROR = "We could not load this. Reload the page.";

const APPLICATION: Record<string, { text: string; tone: Tone }> = {
  submitted: { text: "Sent", tone: "neutral" },
  shortlisted: { text: "Shortlisted", tone: "brand" },
  rejected: { text: "Not taken forward", tone: "danger" },
  withdrawn: { text: "Withdrawn", tone: "neutral" },
};

const DESCRIPTION =
  "Jobs and internships posted by verified IIUC graduates. Verified members can apply, and the graduate who posted it sees your name and message.";

export default function JobsPage({ searchParams }: PageProps<"/jobs">) {
  return (
    <Suspense fallback={<JobsSkeleton />}>
      <Jobs searchParams={searchParams} />
    </Suspense>
  );
}

function JobsSkeleton() {
  return (
    <>
      <PageHeader title="Jobs" description={DESCRIPTION} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-10">
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </>
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

  const jobs = open.data ?? [];
  const mineJobs = mine.data ?? [];
  const applied = applications.data ?? [];

  const panel = (
    <>
      <section aria-labelledby="applied-heading">
        <h2 id="applied-heading" className="text-lg font-bold">
          Your applications
        </h2>
        {applications.error ? (
          <div className="mt-3">
            <Alert tone="danger">{LOAD_ERROR}</Alert>
          </div>
        ) : applied.length === 0 ? (
          <p className="mt-2 text-sm text-muted">You have not applied to a job yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {applied.map((a) => {
              const state = APPLICATION[a.status] ?? { text: a.status, tone: "neutral" as Tone };
              return (
                <li key={a.id} className="flex flex-col gap-2 rounded-xl bg-surface p-3">
                  {a.job ? (
                    <Link
                      href={`/jobs/${a.job.id}`}
                      className="text-sm font-semibold break-words text-foreground"
                    >
                      {a.job.title} at {a.job.company}
                    </Link>
                  ) : (
                    <p className="text-sm font-semibold">A job that is no longer open</p>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge tone={state.tone}>{state.text}</Badge>
                    {a.status === "submitted" || a.status === "shortlisted" ? (
                      <form action={withdrawApplication}>
                        <input type="hidden" name="applicationId" value={a.id} />
                        <button type="submit" className="button button-quiet min-h-11 px-4 text-sm">
                          Withdraw
                        </button>
                      </form>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {mineJobs.length > 0 ? (
        <section aria-labelledby="posted-heading" className="border-t border-border pt-6">
          <h2 id="posted-heading" className="text-lg font-bold">
            Jobs you posted
          </h2>
          <ul className="mt-3 flex flex-col gap-3">
            {mineJobs.map((job) => (
              <li
                key={job.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface p-3"
              >
                <Link href={`/jobs/${job.id}`} className="text-sm font-semibold break-words text-foreground">
                  {job.title}
                </Link>
                <Badge tone={job.status === "active" ? "brand" : "neutral"}>
                  {job.status === "active" ? "Open" : "Closed"}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );

  return (
    <>
      <PageHeader
        title="Jobs"
        description={DESCRIPTION}
        actions={
          canPost ? (
            <LinkButton href="/jobs/new" icon="plus">
              Post a job
            </LinkButton>
          ) : undefined
        }
      />

      {noticeKey ? <Alert tone="success">{NOTICES[noticeKey]}</Alert> : null}
      {params.problem !== undefined ? (
        <Alert tone="danger">That did not work. Reload the page and try again.</Alert>
      ) : null}

      <SidePanelLayout panel={panel} panelLabel="Your activity">
        <section aria-labelledby="open-heading" className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="open-heading" className="text-xl font-bold">
              Open jobs
            </h2>
            {verified && !open.error ? (
              <p className="text-sm font-semibold text-muted tabular-nums">{jobs.length} open</p>
            ) : null}
          </div>
          {open.error ? (
            <Alert tone="danger">{LOAD_ERROR}</Alert>
          ) : !verified ? (
            <EmptyState
              icon="shield-check"
              title="Jobs are for verified members"
              description="Verify your IIUC affiliation to see and apply to jobs."
              action={<LinkButton href="/verify">Verify your affiliation</LinkButton>}
            />
          ) : jobs.length === 0 ? (
            <EmptyState icon="briefcase" title="No open jobs yet" description="Check again soon." />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {jobs.map((job) => (
                <Card as="li" key={job.id} interactive className="flex flex-col gap-4">
                  <div className="flex items-start gap-4">
                    <Avatar id={job.company} name={job.company} size={56} />
                    <div className="min-w-0">
                      <h3 className="text-lg leading-snug font-bold break-words">
                        <Link
                          href={`/jobs/${job.id}`}
                          className="text-foreground no-underline after:absolute after:inset-0 after:rounded-2xl hover:no-underline"
                        >
                          {job.title}
                        </Link>
                      </h3>
                      <p className="mt-0.5 text-sm break-words text-muted">{job.company}</p>
                    </div>
                  </div>
                  <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
                    <Badge tone="ink">{JOB_TYPE_LABEL[job.job_type]}</Badge>
                    {job.location ? (
                      <span className="inline-flex items-center gap-1">
                        <Icon name="map-pin" className="size-4" />
                        {job.location}
                      </span>
                    ) : null}
                    <span className="inline-flex items-center gap-1">
                      <Icon name="clock" className="size-4" />
                      Posted {relativeTime(job.created_at)}
                    </span>
                  </div>
                </Card>
              ))}
            </ul>
          )}
        </section>
      </SidePanelLayout>
    </>
  );
}
