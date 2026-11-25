import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Portrait } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { memberLine } from "@/lib/directory/format";
import { createClient } from "@/lib/supabase/server";
import { isVerified } from "@/lib/verification/status";
import type { Database } from "@/types/database.types";

import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Your profile" };

const VISIBILITY_TEXT: Record<Database["public"]["Enums"]["profile_visibility"], string> = {
  public: "Everyone",
  iiuc_community: "The IIUC community",
  private: "Only you",
};

export default function ProfilePage({ searchParams }: PageProps<"/profile">) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-96 w-full max-w-3xl rounded-2xl" />}>
      <Profile searchParams={searchParams} />
    </Suspense>
  );
}

async function Profile({
  searchParams,
}: Pick<PageProps<"/profile">, "searchParams">) {
  const [params, user] = await Promise.all([searchParams, getCurrentUser()]);
  if (!user) redirect("/sign-in?next=/profile");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, full_name, headline, bio, job_title, company, location, industry, skills, linkedin_url, portfolio_url, github_url, visibility, verification_status, affiliation, department, batch, graduation_year, updated_at",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    return <Alert tone="danger">We could not load your profile. Refresh the page to try again.</Alert>;
  }

  const verified = isVerified(profile.verification_status);

  // The form is asked for; otherwise the page shows the profile as it is.
  if (params.edit === "1") {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <PageHeader
          title="Edit your profile"
          description={
            verified
              ? "Your name, department and batch come from your verified details and cannot be changed here."
              : undefined
          }
        />
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
            portfolioUrl: profile.portfolio_url ?? "",
            githubUrl: profile.github_url ?? "",
            visibility: profile.visibility,
          }}
        />
        <Link href="/profile">Cancel and go back to your profile</Link>
      </div>
    );
  }

  const details: { label: string; value: string | null }[] = [
    { label: "Headline", value: profile.headline },
    { label: "About", value: profile.bio },
    { label: "Skills", value: profile.skills.join(", ") || null },
    { label: "Job title", value: profile.job_title },
    { label: "Company", value: profile.company },
    { label: "City", value: profile.location },
    { label: "Industry", value: profile.industry },
    { label: "LinkedIn", value: profile.linkedin_url },
    { label: "GitHub", value: profile.github_url },
    { label: "Portfolio", value: profile.portfolio_url },
  ];
  const filled = details.filter((d) => d.value);
  const missing = details.filter((d) => !d.value).map((d) => d.label);

  return (
    <div className="grid items-start gap-x-12 gap-y-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <Portrait id={profile.id} name={profile.full_name} className="max-w-48 lg:max-w-none" />

      <div className="flex min-w-0 flex-col gap-6">
        {params.saved === "1" ? <Alert tone="success">Profile saved.</Alert> : null}

        <div className="flex flex-col gap-3">
          <PageHeader title={profile.full_name || "Your profile"} />
          {verified ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand" icon="shield-check">
                Verified
              </Badge>
              <p className="text-muted">{memberLine(profile)}</p>
            </div>
          ) : (
            <Alert tone="info" title="Not in the directory yet">
              Other members can find you once your IIUC affiliation is verified.{" "}
              <Link href="/verify">Verify your affiliation</Link>
            </Alert>
          )}
          <div className="flex flex-wrap items-center gap-4">
            <LinkButton href="/profile?edit=1">Edit profile</LinkButton>
            {verified ? (
              <Link href={`/members/${profile.id}`}>See your profile as other members see it</Link>
            ) : null}
          </div>
        </div>

        {filled.length > 0 ? (
          <dl className="flex flex-col border-t border-border">
            {filled.map((d) => (
              <div key={d.label} className="grid gap-1 border-b border-border py-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
                <dt className="text-sm font-semibold text-muted">{d.label}</dt>
                <dd className="break-words whitespace-pre-line">{d.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {missing.length > 0 ? (
          <p className="text-muted">Not added yet: {missing.join(", ")}.</p>
        ) : null}

        <p className="text-sm text-muted">Who can see your profile: {VISIBILITY_TEXT[profile.visibility]}</p>
      </div>
    </div>
  );
}
