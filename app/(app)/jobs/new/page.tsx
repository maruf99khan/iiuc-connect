import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { JobForm } from "../job-form";

export const metadata: Metadata = { title: "Post a job" };

export default function NewJobPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-96 w-full max-w-2xl rounded-2xl" />}>
      <NewJob />
    </Suspense>
  );
}

async function NewJob() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/jobs/new");

  const supabase = await createClient();
  const { data: me } = await supabase
    .from("profiles")
    .select("affiliation, verification_status")
    .eq("id", user.id)
    .maybeSingle();
  const canPost =
    me?.affiliation === "alumni" &&
    (me.verification_status === "verified_alumni" || me.verification_status === "trusted_member");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title="Post a job"
        description={
          canPost
            ? "Verified IIUC members can read this and apply. You can have up to 10 active jobs and can close or delete a job at any time."
            : undefined
        }
      />
      {canPost ? (
        <Card>
          <JobForm />
        </Card>
      ) : (
        <EmptyState
          icon="shield-check"
          title="Only verified graduates can post jobs"
          description="Check your verification to see what is left to do."
          action={<LinkButton href="/verify">Check your verification</LinkButton>}
        />
      )}
      <Link href="/jobs">Back to jobs</Link>
    </div>
  );
}
