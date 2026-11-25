import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

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
    <Suspense fallback={<p className="text-muted">Loading requests…</p>}>
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
    return (
      <p role="alert" className="leading-7 text-danger">
        We could not load the requests. Refresh the page to try again.
      </p>
    );
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
    <>
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-balance">
          Verification requests
        </h1>
        <p className="leading-7 text-muted">
          Compare each document with the details the member gave. Approve only
          when they match.
        </p>
      </div>

      {notice ? (
        <p
          role="status"
          className="rounded-xl border border-border bg-surface px-4 py-3 text-sm leading-6"
        >
          {notice}
        </p>
      ) : null}

      {requests.length === 0 ? (
        <p className="leading-7 text-muted">No requests are waiting.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {requests.map((request) => (
            <li key={request.id} className="flex flex-col gap-5 py-7">
              <div className="flex flex-col gap-2">
                <h2 className="text-xl font-semibold break-words">
                  {request.profiles?.full_name || "Name not given"}
                </h2>
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
            </li>
          ))}
        </ul>
      )}

      <Link href="/dashboard" className="self-start">
        Back to your dashboard
      </Link>
    </>
  );
}
