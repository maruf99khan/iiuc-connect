import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { memberLine } from "@/lib/directory/format";
import { createClient } from "@/lib/supabase/server";
import { isVerified } from "@/lib/verification/status";

import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Your profile" };

export default function ProfilePage({ searchParams }: PageProps<"/profile">) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-96 w-full max-w-3xl rounded-2xl" />}>
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
      "id, full_name, headline, bio, job_title, company, location, industry, skills, linkedin_url, portfolio_url, github_url, visibility, verification_status, affiliation, department, batch, graduation_year, updated_at",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    return <Alert tone="danger">We could not load your profile. Refresh the page to try again.</Alert>;
  }

  const verified = isVerified(profile.verification_status);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title="Your profile" />

      {verified ? (
        <Card className="flex items-center gap-4">
          <Avatar id={profile.id} name={profile.full_name} size={56} />
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-lg font-bold break-words">
              {profile.full_name}
              <Badge tone="brand" icon="shield-check">
                Verified
              </Badge>
            </p>
            <p className="text-sm text-muted">{memberLine(profile)}</p>
            <p className="mt-1 text-sm text-muted">
              Your name, department and batch come from your verified details and cannot be changed
              here.
            </p>
          </div>
        </Card>
      ) : (
        <Alert tone="info" title="Not in the directory yet">
          Other members can find you in the directory once your IIUC affiliation is verified.{" "}
          <Link href="/verify">Verify your affiliation</Link>
        </Alert>
      )}

      {params.saved === "1" ? <Alert tone="success">Profile saved.</Alert> : null}

      {/* Keyed on the save time so the form remounts with the saved values. */}
      <Card>
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
      </Card>

      {verified ? (
        <Link href={`/members/${profile.id}`}>See your profile as other members see it</Link>
      ) : null}
    </div>
  );
}
