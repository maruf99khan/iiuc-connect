import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState, Skeleton } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentAdmin } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { DOCUMENT_KIND_LABELS } from "@/lib/verification/claim";

import { DecisionForm } from "./decision-form";

export const metadata: Metadata = { title: "Verification requests" };

// Fixed messages looked up by code, so nothing from the URL is shown as text.
const NOTICES: Record<string, string> = {
  approve: "Request approved. The member is now verified.",
  reject:
    "Request rejected. The member can read your note and send a new request.",
};

const SIGNED_URL_SECONDS = 300;

export default function VerificationRequestsPage({
  searchParams,
}: PageProps<"/admin/verifications">) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-96 w-full max-w-3xl rounded-2xl" />}>
      <Queue searchParams={searchParams} />
    </Suspense>
  );
}

async function Queue({
  searchParams,
}: Pick<PageProps<"/admin/verifications">, "searchParams">) {
  const [params, admin] = await Promise.all([searchParams, getCurrentAdmin()]);
  if (!admin) redirect("/dashboard");

  const supabase = await createClient();
  const { data: requests, error } = await supabase
    .from("verification_requests")
    .select(
      "id, created_at, claimed_affiliation, claimed_student_id, claimed_department, claimed_batch, claimed_graduation_year, profiles!verification_requests_user_id_fkey(full_name), verification_documents(id, kind, storage_path)",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    return <Alert tone="danger">We could not load the requests. Refresh the page to try again.</Alert>;
  }

  // Short-lived links: the files stay private and the links stop working.
  const paths = requests.flatMap((r) =>
    r.verification_documents.map((d) => d.storage_path),
  );
  const { data: signed } = paths.length
    ? await supabase.storage
        .from("verification-documents")
        .createSignedUrls(paths, SIGNED_URL_SECONDS)
    : { data: [] };
  const urlFor = new Map(
    (signed ?? []).map((s) => [s.path, s.signedUrl] as const),
  );

  const notice =
    typeof params.done === "string" ? NOTICES[params.done] : undefined;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title="Verification requests"
        description="Compare each document with the details the member gave. Approve only when they match."
        actions={
          <Badge tone={requests.length > 0 ? "warn" : "neutral"}>{requests.length} waiting</Badge>
        }
      />

      {notice ? <Alert tone="success">{notice}</Alert> : null}

      {requests.length === 0 ? (
        <EmptyState icon="shield-check" title="No requests are waiting." description="New ones appear here as members send them." />
      ) : (
        <ul className="flex flex-col gap-4">
          {requests.map((request) => (
            <Card as="li" key={request.id} className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <Avatar
                    id={request.id}
                    name={request.profiles?.full_name || "Name not given"}
                    size={40}
                  />
                  <h2 className="text-xl font-bold break-words">
                    {request.profiles?.full_name || "Name not given"}
                  </h2>
                </div>
                <p className="leading-7">
                  {request.claimed_affiliation === "alumni"
                    ? `Graduate, ${request.claimed_graduation_year}`
                    : "Current student"}
                  {" · "}
                  {request.claimed_department}
                  {" · batch "}
                  {request.claimed_batch}
                </p>
                <p className="text-muted">
                  Student ID{" "}
                  <span className="font-medium text-foreground">
                    {request.claimed_student_id}
                  </span>
                </p>
              </div>

              <ul className="flex flex-col gap-2">
                {request.verification_documents.map((document) => {
                  const href = urlFor.get(document.storage_path);
                  return (
                    <li key={document.id}>
                      {href ? (
                        <a href={href} target="_blank" rel="noreferrer">
                          {DOCUMENT_KIND_LABELS[document.kind]} (opens in a new
                          tab)
                        </a>
                      ) : (
                        <span className="text-danger">
                          {DOCUMENT_KIND_LABELS[document.kind]} could not be
                          loaded
                        </span>
                      )}
                    </li>
                  );
                })}
                {request.verification_documents.length === 0 ? (
                  <li className="text-danger">No document attached</li>
                ) : null}
              </ul>

              <DecisionForm requestId={request.id} />
            </Card>
          ))}
        </ul>
      )}

      <Link href="/dashboard" className="inline-flex items-center gap-2 self-start">
        <Icon name="arrow-right" className="rotate-180" />
        Back to your dashboard
      </Link>
    </div>
  );
}
