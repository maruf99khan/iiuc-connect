import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { memberLine, workLine } from "@/lib/directory/format";
import { isLinkedInUrl } from "@/lib/profile/schema";
import { createClient } from "@/lib/supabase/server";
import { isVerified } from "@/lib/verification/status";

export const metadata: Metadata = { title: "Member" };

export default function MemberPage({ params }: PageProps<"/members/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Member params={params} />
    </Suspense>
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
        "id, full_name, headline, bio, job_title, company, location, industry, department, batch, graduation_year, affiliation, skills, linkedin_url, visibility, verification_status",
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
  const work = workLine(member);

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-balance break-words">
          {member.full_name || "Name not given"}
        </h1>
        {verified ? (
          <p className="text-muted">{memberLine(member)}</p>
        ) : (
          <p className="text-muted">Affiliation not verified yet</p>
        )}
        {work ? <p className="text-muted">{work}</p> : null}
        {member.industry ? (
          <p className="text-sm text-muted">{member.industry}</p>
        ) : null}
      </div>

      {own ? (
        <p
          role="note"
          className="rounded-xl border border-border bg-surface px-4 py-3 text-sm leading-6"
        >
          This is how other members see your profile.{" "}
          <Link href="/profile">Edit it</Link>
        </p>
      ) : null}

      {member.headline ? (
        <p className="text-lg leading-7 break-words">{member.headline}</p>
      ) : null}

      {member.bio ? (
        <section aria-labelledby="about-heading" className="flex flex-col gap-2">
          <h2 id="about-heading" className="text-lg font-semibold">
            About
          </h2>
          <p className="max-w-prose leading-7 break-words whitespace-pre-line">
            {member.bio}
          </p>
        </section>
      ) : null}

      {member.skills.length > 0 ? (
        <section aria-labelledby="skills-heading" className="flex flex-col gap-3">
          <h2 id="skills-heading" className="text-lg font-semibold">
            Skills
          </h2>
          <ul className="flex flex-wrap gap-2">
            {member.skills.map((skill) => (
              <li
                key={skill}
                className="rounded-full border border-border px-3 py-1 text-sm break-words"
              >
                {skill}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {linkedin ? (
        <a
          href={linkedin}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="self-start"
        >
          LinkedIn profile (opens in a new tab)
        </a>
      ) : null}

      <Link href="/directory" className="self-start">
        Back to the directory
      </Link>
    </>
  );
}
