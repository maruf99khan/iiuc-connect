"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { checkEvidence, claimSchema } from "@/lib/verification/claim";
import type { ClaimFormState } from "@/lib/verification/form-state";

const BUCKET = "verification-documents";

const FIELDS = [
  "fullName",
  "affiliation",
  "studentId",
  "department",
  "batch",
  "graduationYear",
  "documentKind",
] as const;

/** The typed values, echoed back so a failed attempt keeps the form filled in. */
function echo(formData: FormData): ClaimFormState["values"] {
  const values: NonNullable<ClaimFormState["values"]> = {};
  for (const field of FIELDS) {
    const value = formData.get(field);
    if (typeof value === "string") values[field] = value.slice(0, 200);
  }
  return values;
}

export async function submitClaim(
  _previous: ClaimFormState,
  formData: FormData,
): Promise<ClaimFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/verify");

  const values = echo(formData);
  const parsed = claimSchema.safeParse(
    Object.fromEntries(FIELDS.map((f) => [f, formData.get(f)])),
  );
  const fieldErrors: NonNullable<ClaimFormState["fieldErrors"]> = parsed.success
    ? {}
    : z.flattenError(parsed.error).fieldErrors;

  // The file is checked on the server by its content, not by the name or type
  // the browser reports.
  const file = formData.get("document");
  const upload = file instanceof File ? file : null;
  const head = upload
    ? new Uint8Array(await upload.slice(0, 16).arrayBuffer())
    : new Uint8Array();
  const evidence = checkEvidence(upload?.size ?? 0, head);
  if (!evidence.ok) fieldErrors.document = [evidence.message];

  if (!parsed.success || !evidence.ok || !upload) {
    return {
      status: "error",
      // A summary at the top, so a screen reader hears that something needs
      // fixing before it reaches the field.
      message: "Some details need fixing. Check the fields marked below.",
      fieldErrors,
      values,
    };
  }

  const claim = parsed.data;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("verification_status")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.verification_status === "unverified") {
    return {
      status: "error",
      message: "Confirm your email address before submitting your details.",
      values,
    };
  }
  if (profile?.verification_status !== "email_verified") {
    // Already waiting for review, or already verified: nothing to submit.
    redirect("/verify");
  }

  // The admin compares the name on the document with this one.
  const { error: nameError } = await supabase
    .from("profiles")
    .update({ full_name: claim.fullName })
    .eq("id", user.id);
  if (nameError) {
    console.error("claim: could not save name:", nameError.code);
    return failure(values);
  }

  const { data: request, error: requestError } = await supabase
    .from("verification_requests")
    .insert({
      method: "document",
      claimed_affiliation: claim.affiliation,
      claimed_student_id: claim.studentId,
      claimed_department: claim.department,
      claimed_batch: claim.batch,
      claimed_graduation_year: claim.graduationYear ?? null,
    })
    .select("id")
    .single();

  if (requestError || !request) {
    if (requestError?.code === "23505") redirect("/verify");
    console.error("claim: could not create request:", requestError?.code);
    return failure(values);
  }

  // From here a failure must not leave a request with no evidence behind.
  const path = `${user.id}/${request.id}/${crypto.randomUUID()}.${evidence.extension}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, await upload.arrayBuffer(), {
      contentType: evidence.type,
      upsert: false,
    });

  const { error: documentError } = uploadError
    ? { error: uploadError }
    : await supabase.from("verification_documents").insert({
        request_id: request.id,
        kind: claim.documentKind,
        storage_path: path,
      });

  if (uploadError || documentError) {
    console.error(
      "claim: could not attach document:",
      uploadError?.message ?? documentError?.message,
    );
    await supabase
      .from("verification_requests")
      .update({ status: "cancelled" })
      .eq("id", request.id);
    return failure(values);
  }

  redirect("/verify");
}

function failure(values: ClaimFormState["values"]): ClaimFormState {
  return {
    status: "error",
    message:
      "We could not send your details. Nothing was submitted. Try again in a moment.",
    values,
  };
}

/** Withdraws the member's own open request. */
export async function withdrawClaim() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/verify");

  const supabase = await createClient();
  const { error } = await supabase
    .from("verification_requests")
    .update({ status: "cancelled" })
    .eq("user_id", user.id)
    .eq("status", "pending");

  if (error) console.error("withdraw failed:", error.code);
  redirect("/verify");
}
