import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { JobForm } from "../job-form";

export const metadata: Metadata = { title: "Post a job" };

export default function NewJobPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
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
    <>
      <h1 className="text-3xl font-bold tracking-tight text-balance">Post a job</h1>
      {canPost ? (
        <>
          <p className="max-w-prose leading-7 text-muted">
            Verified IIUC members can read this and apply. You can have up to 10
            active jobs and can close or delete a job at any time.
          </p>
          <JobForm />
        </>
      ) : (
        <p className="max-w-prose leading-7 text-muted">
          Only verified graduates can post jobs.{" "}
          <Link href="/verify">Check your verification</Link>
        </p>
      )}
      <Link href="/jobs" className="self-start">
        Back to jobs
      </Link>
    </>
  );
}
