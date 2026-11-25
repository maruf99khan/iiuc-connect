import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { Portrait } from "@/components/ui/avatar";
import { Badge, Chip } from "@/components/ui/badge";
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
    <div className="grid gap-10 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <Skeleton className="aspect-[10/11] max-w-56 rounded-tr-[2.75rem] lg:max-w-none" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-14 w-3/4" />
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-40" />
      </div>
    </div>
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

  return (
    <div className="grid items-start gap-x-12 gap-y-8 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <Portrait id={member.id} name={name} className="max-w-56 lg:max-w-none" />

      <div className="flex flex-col gap-8 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        {own ? (
          <Alert tone="info">
            This is how other members see your profile. <Link href="/profile">Edit it</Link>
          </Alert>
        ) : null}

        <header className="flex flex-col gap-3">
          <h1 className="text-4xl leading-[1.05] font-extrabold break-words text-ink sm:text-6xl">
            {name}
          </h1>
          {member.headline ? <p className="text-xl break-words">{member.headline}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            {verified ? (
              <>
                <Badge tone={alumni ? "accent" : "ink"}>{alumni ? "Alumni" : "Student"}</Badge>
                <Badge tone="brand" icon="shield-check">
                  Verified
                </Badge>
                <p className="text-muted">{memberLine(member)}</p>
              </>
            ) : (
              <p className="text-muted">Affiliation not verified yet</p>
            )}
          </div>
          {work ? (
            <p className="flex items-center gap-2 text-muted">
              <Icon name="building" className="size-4" />
              <span className="break-words">{work}</span>
            </p>
          ) : null}
          {member.industry ? <p className="text-sm text-muted">{member.industry}</p> : null}
        </header>

        {member.bio ? (
          <section aria-labelledby="about-heading" className="flex flex-col gap-3 border-t border-border pt-6">
            <h2 id="about-heading" className="text-2xl font-extrabold">
              About
            </h2>
            <p className="max-w-prose text-lg break-words whitespace-pre-line">{member.bio}</p>
          </section>
        ) : null}

        {member.skills.length > 0 ? (
          <section aria-labelledby="skills-heading" className="flex flex-col gap-4 border-t border-border pt-6">
            <h2 id="skills-heading" className="text-2xl font-extrabold">
              Skills
            </h2>
            <ul className="flex flex-wrap gap-2">
              {member.skills.map((skill) => (
                <li key={skill}>
                  <Chip>{skill}</Chip>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {links.length > 0 ? (
          <section aria-labelledby="links-heading" className="flex flex-col gap-2 border-t border-border pt-6">
            <h2 id="links-heading" className="text-2xl font-extrabold">
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
          </section>
        ) : null}

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {own && member.affiliation === "alumni" ? <Link href="/sessions">Manage your sessions</Link> : null}
          <Link href="/directory">Back to the directory</Link>
        </div>
      </div>

      {mentor ? (
        <section
          aria-labelledby="request-heading"
          className="rounded-md rounded-tr-[2.75rem] bg-navy p-6 text-white lg:col-start-1 lg:row-start-2"
        >
          <h2 id="request-heading" className="text-2xl font-extrabold">
            Request a session
          </h2>
          {!mentor.accepting_requests ? (
            <p className="mt-2 text-white/85">This graduate is not taking requests right now.</p>
          ) : slots && slots.length > 0 ? (
            <>
              <p className="mt-2 text-sm text-white/85">
                All times are Bangladesh time. The graduate has 72 hours to answer.
              </p>
              <ul className="mt-4 flex flex-col gap-3">
                {slots.map((slot) => (
                  <li key={slot.id} className="rounded-xl bg-white/10 p-3">
                    <p className="flex items-center gap-2 font-bold">
                      <Icon name="clock" className="size-4" />
                      {formatDhaka(slot.starts_at)}
                    </p>
                    <details className="mt-1">
                      <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold underline underline-offset-4">
                        Request this time
                      </summary>
                      <div className="mt-2 rounded-xl bg-background p-4 text-foreground">
                        <RequestForm slotId={slot.id} />
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-2 text-white/85">No open times right now. Check again soon.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
