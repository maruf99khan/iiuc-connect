import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getCurrentUser } from "@/lib/auth/session";
import { memberLine } from "@/lib/directory/format";
import { createClient } from "@/lib/supabase/server";
import { isVerified } from "@/lib/verification/status";

import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Your profile" };

export default function ProfilePage({ searchParams }: PageProps<"/profile">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading your profile…</p>}>
      <Editor searchParams={searchParams} />
    </Suspense>
  );
}

async function Editor({
  searchParams,
}: Pick<PageProps<"/profile">, "searchParams">) {
  const [params, user] = await Promise.all([searchParams, getCurrentUser()]);
  if (!user) redirect("/sign-in?next=/profile");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, full_name, headline, bio, job_title, company, location, industry, skills, linkedin_url, visibility, verification_status, affiliation, department, batch, graduation_year, updated_at",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    return (
      <p role="alert" className="leading-7 text-danger">
        We could not load your profile. Refresh the page to try again.
      </p>
    );
  }

  const verified = isVerified(profile.verification_status);

  return (
    <>
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-balance">
          Your profile
        </h1>
        {verified ? (
          <div className="flex flex-col gap-1">
            <p className="text-lg font-semibold break-words">
              {profile.full_name}
            </p>
            <p className="text-muted">{memberLine(profile)}</p>
            <p className="text-sm text-muted">
              Your name, department and batch come from your verified details
              and cannot be changed here.
            </p>
          </div>
        ) : (
          <p className="max-w-prose leading-7 text-muted">
            Other members can find you in the directory once your IIUC
            affiliation is verified.{" "}
            <Link href="/verify">Verify your affiliation</Link>
          </p>
        )}
      </div>

      {params.saved === "1" ? (
        <p
          role="status"
          className="rounded-xl border border-border bg-surface px-4 py-3 text-sm leading-6"
        >
          Profile saved.
        </p>
      ) : null}

      {/* Keyed on the save time so the form remounts with the saved values. */}
      <ProfileForm
        key={profile.updated_at}
        nameLocked={verified}
        initial={{
          fullName: profile.full_name,
          headline: profile.headline ?? "",
          bio: profile.bio ?? "",
          jobTitle: profile.job_title ?? "",
          company: profile.company ?? "",
          location: profile.location ?? "",
          industry: profile.industry ?? "",
          skills: profile.skills.join(", "),
          linkedinUrl: profile.linkedin_url ?? "",
          visibility: profile.visibility,
        }}
      />

      {verified ? (
        <Link href={`/members/${profile.id}`} className="self-start">
          See your profile as other members see it
        </Link>
      ) : null}
    </>
  );
}
