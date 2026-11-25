import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { Avatar } from "@/components/ui/avatar";
import { Badge, Chip } from "@/components/ui/badge";
import { SidePanelLayout } from "@/components/ui/browse";
import { Card } from "@/components/ui/card";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icons";
import { getCurrentUser } from "@/lib/auth/session";
import { memberLine, workLine } from "@/lib/directory/format";
import { isGithubUrl, isLinkedInUrl, isPortfolioUrl } from "@/lib/profile/schema";
import { formatDhaka } from "@/lib/mentorship/time";
import { createClient } from "@/lib/supabase/server";
import { isVerified } from "@/lib/verification/status";

import { RequestForm } from "./request-form";

export const metadata: Metadata = { title: "Member" };

export default function MemberPage({ params }: PageProps<"/members/[id]">) {
  return (
    <Suspense fallback={<MemberSkeleton />}>
      <Member params={params} />
    </Suspense>
  );
}

function MemberSkeleton() {
  return (
    <>
      <Skeleton className="h-52 rounded-2xl" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-10">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    </>
  );
}

async function Member({ params }: Pick<PageProps<"/members/[id]">, "params">) {
  const [{ id }, user] = await Promise.all([params, getCurrentUser()]);
  if (!user) redirect(`/sign-in?next=/members/${encodeURIComponent(id)}`);
  if (!z.uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const [{ data: member }, { data: me }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, full_name, headline, bio, job_title, company, location, industry, department, batch, graduation_year, affiliation, skills, linkedin_url, portfolio_url, github_url, visibility, verification_status",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("verification_status")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const own = id === user.id;

  // Only verified members browse other members, whatever a row's own
  // visibility says. An admin can read private rows, so exclude them here.
  if (!own && (!me || !isVerified(me.verification_status))) redirect("/verify");
  if (!member) notFound();
  if (
    !own &&
    (member.visibility === "private" || !isVerified(member.verification_status))
  ) {
    notFound();
  }

  const verified = isVerified(member.verification_status);
  // The database also constrains this, but a link is only shown if it still
  // passes the same check.
  const linkedin =
    member.linkedin_url && isLinkedInUrl(member.linkedin_url)
      ? member.linkedin_url
      : null;
  const github =
    member.github_url && isGithubUrl(member.github_url) ? member.github_url : null;
  const portfolio =
    member.portfolio_url && isPortfolioUrl(member.portfolio_url)
      ? member.portfolio_url
      : null;
  const work = workLine(member);
  const name = member.full_name || "Name not given";
  const alumni = member.affiliation === "alumni";

  // A graduate's mentor settings and open times, for another verified member to
  // request. Row Level Security already hides a private mentor's slots.
  const { data: mentor } =
    member.affiliation === "alumni" && verified && !own
      ? await supabase
          .from("mentor_profiles")
          .select("accepting_requests, expertise_areas, max_sessions_per_week")
          .eq("id", id)
          .maybeSingle()
      : { data: null };
  const { data: slots } = mentor?.accepting_requests
    ? await supabase
        .from("mentor_slots")
        .select("id, starts_at")
        .eq("mentor_id", id)
        .eq("status", "open")
        .gt("starts_at", new Date().toISOString())
        .order("starts_at")
        .limit(40)
    : { data: null };

  const links = [
    linkedin && { href: linkedin, text: "LinkedIn profile (opens in a new tab)" },
    github && { href: github, text: "GitHub profile (opens in a new tab)" },
    portfolio && { href: portfolio, text: "Portfolio or personal site (opens in a new tab)" },
  ].filter((l): l is { href: string; text: string } => Boolean(l));

  const header = (
    <Card padded={false} className="overflow-hidden">
      <div aria-hidden="true" className="h-28 bg-linear-to-r from-navy via-navy to-brand sm:h-36" />
      <div className="flex flex-col gap-4 px-5 pb-6 sm:px-8">
        <Avatar
          id={member.id}
          name={name}
          size={96}
          className="-mt-12 ring-4 ring-background"
        />
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-extrabold break-words sm:text-4xl">{name}</h1>
          {member.headline ? (
            <p className="text-lg break-words text-muted">{member.headline}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {verified ? (
            <>
              <Badge tone={alumni ? "accent" : "ink"}>{alumni ? "Alumni" : "Student"}</Badge>
              <Badge tone="brand" icon="shield-check">
                Verified
              </Badge>
              <p className="text-sm text-muted">{memberLine(member)}</p>
            </>
          ) : (
            <p className="text-muted">Affiliation not verified yet</p>
          )}
        </div>
        {work || member.industry ? (
          <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-muted">
            {work ? (
              <span className="inline-flex items-center gap-1.5">
                <Icon name="building" className="size-4" />
                {work}
              </span>
            ) : null}
            {member.industry ? <span className="text-sm">{member.industry}</span> : null}
          </p>
        ) : null}
      </div>
    </Card>
  );

  const body = (
    <>
      {own ? (
        <Alert tone="info">
          This is how other members see your profile. <Link href="/profile">Edit it</Link>
        </Alert>
      ) : null}

      {member.bio ? (
        <section aria-labelledby="about-heading">
          <Card className="flex flex-col gap-3">
            <h2 id="about-heading" className="text-xl font-bold">
              About
            </h2>
            <p className="max-w-prose leading-7 break-words whitespace-pre-line">{member.bio}</p>
          </Card>
        </section>
      ) : null}

      {member.skills.length > 0 ? (
        <section aria-labelledby="skills-heading">
          <Card className="flex flex-col gap-4">
            <h2 id="skills-heading" className="text-xl font-bold">
              Skills
            </h2>
            <ul className="flex flex-wrap gap-2">
              {member.skills.map((skill) => (
                <li key={skill}>
                  <Chip>{skill}</Chip>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      {links.length > 0 ? (
        <section aria-labelledby="links-heading">
          <Card className="flex flex-col gap-3">
            <h2 id="links-heading" className="text-xl font-bold">
              Links
            </h2>
            <ul className="flex flex-col gap-1">
              {links.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex min-h-11 items-center gap-2"
                  >
                    <Icon name="link" className="size-4" />
                    {l.text}
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {own && member.affiliation === "alumni" ? <Link href="/sessions">Manage your sessions</Link> : null}
        <Link href="/directory">Back to the directory</Link>
      </div>
    </>
  );

  if (!mentor) {
    return (
      <>
        {header}
        <div className="flex max-w-3xl flex-col gap-6">{body}</div>
      </>
    );
  }

  const panel = (
    <section aria-labelledby="request-heading">
      <h2 id="request-heading" className="text-lg font-bold">
        Request a session
      </h2>
      {!mentor.accepting_requests ? (
        <p className="mt-2 text-muted">This graduate is not taking requests right now.</p>
      ) : slots && slots.length > 0 ? (
        <>
          <p className="mt-2 text-sm text-muted">
            All times are Bangladesh time. The graduate has 72 hours to answer.
          </p>
          <ul className="mt-4 flex flex-col gap-3">
            {slots.map((slot) => (
              <li key={slot.id} className="rounded-xl bg-surface p-3">
                <p className="flex items-center gap-2 font-semibold">
                  <Icon name="clock" className="size-4 text-brand" />
                  {formatDhaka(slot.starts_at)}
                </p>
                <details className="mt-1 flex flex-col gap-3">
                  <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-brand">
                    Request this time
                  </summary>
                  <div className="pt-3">
                    <RequestForm slotId={slot.id} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-2 text-muted">No open times right now. Check again soon.</p>
      )}
    </section>
  );

  return (
    <>
      {header}
      <SidePanelLayout panel={panel} panelLabel="Mentorship">
        {body}
      </SidePanelLayout>
    </>
  );
}
