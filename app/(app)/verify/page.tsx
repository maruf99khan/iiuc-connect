import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DOCUMENT_KIND_LABELS } from "@/lib/verification/claim";

import { withdrawClaim } from "./actions";
import { ClaimForm } from "./claim-form";

export const metadata: Metadata = { title: "Verify your affiliation" };

export default function VerifyPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <VerifyContent />
    </Suspense>
  );
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Dhaka",
  });

async function VerifyContent() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/verify");

  const supabase = await createClient();
  const [{ data: profile }, { data: requests }] = await Promise.all([
    supabase
      .from("profiles")
      .select("verification_status, full_name, affiliation, department, batch")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("verification_requests")
      .select(
        "status, claimed_affiliation, claimed_student_id, claimed_department, claimed_batch, claimed_graduation_year, review_notes, created_at, verification_documents(kind)",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  if (!profile) {
    return (
      <p role="alert" className="leading-7 text-danger">
        We could not load your account. Refresh the page to try again.
      </p>
    );
  }

  const latest = requests?.[0];

  switch (profile.verification_status) {
    case "unverified":
      return (
        <Page title="Confirm your email first">
          <p className="leading-7 text-muted">
            We can only look at your IIUC details once your email address is
            confirmed. Open the link we emailed you, then come back.
          </p>
          <BackLink />
        </Page>
      );

    case "email_verified":
      return (
        <Page
          title="Verify your IIUC affiliation"
          intro="Tell us who you are and send a photo or scan of your student ID card or certificate. An admin checks it against the details you give."
        >
          {latest?.status === "rejected" ? (
            <p
              role="status"
              className="rounded-xl border border-border bg-surface px-4 py-3 text-sm leading-6"
            >
              Your last request was not approved
              {latest.review_notes ? `: ${latest.review_notes}` : "."} You can
              send a new one below.
            </p>
          ) : null}
          <ClaimForm defaultName={profile.full_name} />
        </Page>
      );

    case "affiliation_pending":
      return (
        <Page
          title="Your request is being reviewed"
          intro="An admin will check it soon. The result appears here and on your dashboard."
        >
          {latest ? (
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <Item label="You said you are">
                {latest.claimed_affiliation === "alumni"
                  ? "A graduate"
                  : "A current student"}
              </Item>
              <Item label="Student ID">{latest.claimed_student_id}</Item>
              <Item label="Department">{latest.claimed_department}</Item>
              <Item label="Batch">{latest.claimed_batch}</Item>
              {latest.claimed_graduation_year ? (
                <Item label="Graduated">{latest.claimed_graduation_year}</Item>
              ) : null}
              <Item label="Document">
                {latest.verification_documents
                  .map((d) => DOCUMENT_KIND_LABELS[d.kind])
                  .join(", ") || "None attached"}
              </Item>
              <Item label="Sent on">{formatDate(latest.created_at)}</Item>
            </dl>
          ) : null}
          <form action={withdrawClaim} className="flex flex-col gap-2">
            <button type="submit" className="button button-quiet self-start">
              Withdraw this request
            </button>
            <p className="text-sm text-muted">
              Made a mistake? Withdraw it and send a corrected one.
            </p>
          </form>
        </Page>
      );

    default:
      return (
        <Page title="You are verified">
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <Item label="Status">
              {profile.affiliation === "alumni" ? "IIUC graduate" : "IIUC student"}
            </Item>
            {profile.department ? (
              <Item label="Department">{profile.department}</Item>
            ) : null}
            {profile.batch ? <Item label="Batch">{profile.batch}</Item> : null}
          </dl>
          <BackLink />
        </Page>
      );
  }
}

function Page({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <>
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-balance">
          {title}
        </h1>
        {intro ? (
          <p className="max-w-prose leading-7 text-muted">{intro}</p>
        ) : null}
      </div>
      {children}
    </>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-medium break-words">{children}</dd>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/dashboard" className="self-start">
      Back to your dashboard
    </Link>
  );
}
