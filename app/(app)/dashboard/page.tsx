import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { SidePanelLayout } from "@/components/ui/browse";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { Icon, type IconName } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { relativeTime } from "@/lib/ui/format";

import { MemberCard } from "../directory/member-card";
import {
  VERIFICATION_COPY,
  VERIFICATION_STEPS,
  isVerified,
} from "@/lib/verification/status";

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
      <Skeleton className="h-12 w-2/3" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-10">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
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
  const verified = isVerified(profile.verification_status);

  const shortcuts: { href: string; label: string; icon: IconName }[] = [
    { href: "/profile", label: "Edit your profile", icon: "user" },
    ...(verified
      ? [
          { href: "/directory", label: "Browse the member directory", icon: "users" as const },
          { href: "/jobs", label: "See open jobs", icon: "briefcase" as const },
          { href: "/sessions", label: "Your mentorship sessions", icon: "calendar" as const },
        ]
      : []),
    ...(profile.role === "admin"
      ? [{ href: "/admin/verifications", label: "Review verification requests", icon: "shield-check" as const }]
      : []),
  ];

  // For a verified member the home page is somewhere to start: people and jobs, from the same
  // queries the directory and jobs pages run (both enforce Row Level Security as the member).
  const [people, latestJobs] = verified
    ? await Promise.all([
        supabase.rpc("search_members", { p_query: "", p_limit: 4, p_offset: 0 }),
        supabase
          .from("jobs")
          .select("id, title, company, created_at")
          .eq("status", "active")
          .neq("poster_id", user.id)
          .order("created_at", { ascending: false })
          .limit(4),
      ])
    : [null, null];

  const discover = verified ? (
    <>
      <Alert tone="success" title="Your IIUC affiliation is verified">
        You can search the directory, request mentorship sessions and apply to jobs.
      </Alert>

      <section aria-labelledby="people-heading" className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="people-heading" className="text-xl font-bold">
            People you could meet
          </h2>
          <Link href="/directory">See everyone</Link>
        </div>
        {people?.error || !people?.data || people.data.length === 0 ? (
          <p className="text-muted">No members to show yet.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {people.data.map((member) => (
              <MemberCard key={member.id} member={member} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="latest-jobs-heading" className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="latest-jobs-heading" className="text-xl font-bold">
            Latest jobs
          </h2>
          <Link href="/jobs">All jobs</Link>
        </div>
        {latestJobs?.error || !latestJobs?.data || latestJobs.data.length === 0 ? (
          <p className="text-muted">No open jobs yet.</p>
        ) : (
          <Card padded={false}>
            <ul className="flex flex-col">
              {latestJobs.data.map((job) => (
                <li key={job.id} className="border-t border-border first:border-t-0">
                  <Link
                    href={`/jobs/${job.id}`}
                    className="flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 text-foreground no-underline hover:bg-surface hover:no-underline"
                  >
                    <span className="min-w-0">
                      <span className="block font-semibold break-words">{job.title}</span>
                      <span className="block text-sm text-muted">{job.company}</span>
                    </span>
                    <span className="text-sm text-muted">{relativeTime(job.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </>
  ) : null;

  const panel = (
    <section aria-labelledby="community-heading">
      <h2 id="community-heading" className="text-lg font-bold">
        Jump in
      </h2>
      <ul className="mt-3 flex flex-col">
        {shortcuts.map((s) => (
          <li key={s.href} className="border-t border-border first:border-t-0">
            <Link
              href={s.href}
              className="group flex min-h-14 items-center gap-3 text-foreground no-underline hover:no-underline"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                <Icon name={s.icon} />
              </span>
              <span className="font-semibold group-hover:underline">{s.label}</span>
              <Icon
                name="arrow-right"
                className="ml-auto text-muted transition-transform duration-150 group-hover:translate-x-0.5"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <>
      <PageHeader
        title={copy.headline}
        description={user.email ? `Signed in as ${user.email}` : undefined}
      />

      <SidePanelLayout panel={panel} panelLabel="Shortcuts">
        {discover}
        {verified ? null : (
        <section aria-labelledby="steps-heading">
          <Card className="flex flex-col gap-6">
            <h2 id="steps-heading" className="text-xl font-bold">
              Your verification
            </h2>
            <ol className="flex flex-col">
              {VERIFICATION_STEPS.map((title, index) => {
                const done = index < copy.stepsDone;
                const current = index === copy.stepsDone;
                const last = index === VERIFICATION_STEPS.length - 1;

                return (
                  <li
                    key={title}
                    aria-current={current ? "step" : undefined}
                    className="flex gap-4"
                  >
                    <div className="flex flex-col items-center">
                      <StepMarker done={done} current={current} />
                      {last ? null : (
                        <span
                          aria-hidden="true"
                          className={`w-0.5 flex-1 ${done ? "bg-brand" : "bg-border"}`}
                        />
                      )}
                    </div>
                    <div className={`flex flex-col gap-1 ${last ? "" : "pb-8"}`}>
                      <p className={`text-lg leading-7 font-semibold ${done || current ? "" : "text-muted"}`}>
                        <span className="sr-only">
                          {done ? "Done: " : current ? "Current step: " : "Later: "}
                        </span>
                        {title}
                      </p>
                      {current && copy.detail ? (
                        <p className="max-w-prose leading-7 text-muted">{copy.detail}</p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
            {copy.action ? (
              <div>
                <LinkButton href={copy.action.href} icon="arrow-right">
                  {copy.action.label}
                </LinkButton>
              </div>
            ) : null}
          </Card>
        </section>
        )}
      </SidePanelLayout>
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
