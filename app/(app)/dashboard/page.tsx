import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LinkButton } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { bookableAfter } from "@/lib/mentorship/time";
import { createClient } from "@/lib/supabase/server";
import { relativeTime } from "@/lib/ui/format";
import {
  VERIFICATION_COPY,
  VERIFICATION_STEPS,
  isVerified,
} from "@/lib/verification/status";

import { MemberCard, type Member } from "../directory/member-card";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <AccountStatus />
    </Suspense>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <Skeleton className="h-64 rounded-tr-[2.75rem]" />
      <Skeleton className="h-20" />
      <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="aspect-[10/11] rounded-tr-[2.75rem]" />
        ))}
      </div>
    </>
  );
}

async function AccountStatus() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/sign-in?next=/dashboard");
  }

  // Row Level Security lets a member read their own row, so this needs no
  // privileged key.
  const supabase = await createClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("verification_status, role")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile) {
    return <Alert tone="danger">We could not load your account. Refresh the page to try again.</Alert>;
  }

  const copy = VERIFICATION_COPY[profile.verification_status];
  const signedIn = user.email ? `Signed in as ${user.email}` : undefined;
  const adminLink =
    profile.role === "admin" ? (
      <Link href="/admin/verifications">Review verification requests</Link>
    ) : null;

  if (!isVerified(profile.verification_status)) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <PageHeader title={copy.headline} description={signedIn} />
        <section aria-labelledby="steps-heading" className="flex flex-col gap-6 border-t border-border pt-6">
          <h2 id="steps-heading" className="text-2xl font-extrabold">
            Your verification
          </h2>
          <ol className="flex flex-col">
            {VERIFICATION_STEPS.map((title, index) => {
              const done = index < copy.stepsDone;
              const current = index === copy.stepsDone;
              const last = index === VERIFICATION_STEPS.length - 1;

              return (
                <li key={title} aria-current={current ? "step" : undefined} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <StepMarker done={done} current={current} />
                    {last ? null : (
                      <span aria-hidden="true" className={`w-0.5 flex-1 ${done ? "bg-brand" : "bg-border"}`} />
                    )}
                  </div>
                  <div className={`flex flex-col gap-1 ${last ? "" : "pb-8"}`}>
                    <p className={`text-lg leading-8 font-semibold ${done || current ? "" : "text-muted"}`}>
                      <span className="sr-only">
                        {done ? "Done: " : current ? "Current step: " : "Later: "}
                      </span>
                      {title}
                    </p>
                    {current && copy.detail ? <p className="max-w-prose text-muted">{copy.detail}</p> : null}
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="flex flex-wrap items-center gap-4">
            {copy.action ? (
              <LinkButton href={copy.action.href} icon="arrow-right">
                {copy.action.label}
              </LinkButton>
            ) : null}
            <Link href="/profile">Edit your profile</Link>
            {adminLink}
          </div>
        </section>
      </div>
    );
  }

  // A verified member's home: who can be asked for time, and what is new. Every query runs as
  // the member, so Row Level Security decides what comes back.
  const [people, jobs, mentors, slots] = await Promise.all([
    supabase.rpc("search_members", { p_query: "", p_limit: 4, p_offset: 0 }),
    supabase
      .from("jobs")
      .select("id, title, company, created_at", { count: "exact" })
      .eq("status", "active")
      .neq("poster_id", user.id)
      .order("created_at", { ascending: false })
      .limit(4),
    supabase
      .from("mentor_profiles")
      .select("id", { count: "exact" })
      .eq("accepting_requests", true)
      .neq("id", user.id),
    supabase
      .from("mentor_slots")
      .select("mentor_id")
      .eq("status", "open")
      .neq("mentor_id", user.id)
      .gt("starts_at", bookableAfter())
      .order("starts_at")
      .limit(200),
  ]);

  // A slot can outlive its mentor's "accepting requests" switch, and the database refuses a
  // request then, so only mentors who are accepting are offered.
  const accepting = new Set((mentors.data ?? []).map((m) => m.id));
  const soonest = [...new Set((slots.data ?? []).map((s) => s.mentor_id))]
    .filter((id) => accepting.has(id))
    .slice(0, 4);
  const { data: free } = soonest.length
    ? await supabase
        .from("profiles")
        .select(
          "id, full_name, headline, job_title, company, location, department, batch, affiliation, skills, visibility, verification_status",
        )
        .in("id", soonest)
    : { data: null };
  // An admin can read private rows, so they are excluded here as on the member page.
  const available = (free ?? []).filter(
    (m) => m.visibility !== "private" && isVerified(m.verification_status),
  );
  const shown: Member[] = available.length > 0 ? (available as Member[]) : (people.data ?? []);

  const counts = [
    // The search leaves out the viewer, hence "other".
    { value: people.data?.[0]?.total, label: "other members" },
    { value: mentors.count, label: "taking requests" },
    { value: jobs.count, label: "open jobs" },
  ].filter((c) => c.value !== undefined && c.value !== null);

  return (
    <>
      <section className="grid items-stretch gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col justify-center gap-5 lg:py-8">
          <PageHeader title={copy.headline} description={signedIn} />
          <p className="max-w-prose text-lg">
            Ask someone who has been there. Thirty minutes is enough to start.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <LinkButton href="/directory" className="bg-accent text-background hover:bg-accent/90">
              Browse the member directory
            </LinkButton>
            <LinkButton href="/jobs" variant="quiet">
              See open jobs
            </LinkButton>
          </div>
          <p className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/sessions">Your mentorship sessions</Link>
            <Link href="/profile">Edit your profile</Link>
            {adminLink}
          </p>
        </div>
        <div className="relative min-h-52 overflow-hidden lg:min-h-80 lg:[clip-path:polygon(9%_0,100%_0,100%_100%,0_100%)]">
          <Image
            src="/brand/campus-aerial.webp"
            alt=""
            fill
            sizes="(min-width: 1024px) 34rem, 100vw"
            className="object-cover"
          />
        </div>
      </section>

      <ul className="flex flex-wrap gap-x-12 gap-y-3 border-y border-border py-5">
        {counts.map((c) => (
          <li key={c.label} className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold text-accent tabular-nums">{c.value}</span>
            <span className="text-muted">{c.label}</span>
          </li>
        ))}
      </ul>

      <section aria-labelledby="people-heading" className="flex flex-col gap-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="people-heading" className="text-2xl font-extrabold">
            {available.length > 0 ? "Mentors with open times" : "People you could meet"}
          </h2>
          <Link href="/directory">See everyone</Link>
        </div>
        {shown.length === 0 ? (
          <p className="text-muted">No members to show yet.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4 lg:gap-x-6">
            {shown.map((member) => (
              <MemberCard key={member.id} member={member} mentoring={accepting.has(member.id)} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="latest-jobs-heading" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="latest-jobs-heading" className="text-2xl font-extrabold">
            Latest jobs
          </h2>
          <Link href="/jobs">All jobs</Link>
        </div>
        {jobs.error || !jobs.data || jobs.data.length === 0 ? (
          <p className="text-muted">No open jobs yet.</p>
        ) : (
          <ul className="flex flex-col">
            {jobs.data.map((job) => (
              <li key={job.id} className="border-t border-border">
                <Link
                  href={`/jobs/${job.id}`}
                  className="group flex min-h-20 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-foreground no-underline"
                >
                  <span className="min-w-0">
                    <span className="block text-lg font-bold break-words group-hover:underline">
                      {job.title}
                    </span>
                    <span className="block text-sm text-muted">{job.company}</span>
                  </span>
                  <span className="text-sm text-muted">{relativeTime(job.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function StepMarker({ done, current }: { done: boolean; current: boolean }) {
  if (done) {
    return (
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-on-brand"
      >
        <Icon name="check" className="size-5 stroke-[2.5]" />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`flex size-8 shrink-0 items-center justify-center rounded-full border-2 ${current ? "border-brand" : "border-border"}`}
    >
      {current ? <span className="size-3 rounded-full bg-brand" /> : null}
    </span>
  );
}
