"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getCurrentAdmin } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import type { DecisionFormState } from "@/lib/verification/form-state";

const decisionSchema = z
  .object({
    requestId: z.uuid(),
    decision: z.enum(["approve", "reject"]),
    notes: z.string().trim().max(1000, { error: "Use 1000 characters or fewer." }),
  })
  .refine((d) => d.decision === "approve" || d.notes.length > 0, {
    path: ["notes"],
    error: "Write the reason. The member will see it.",
  });

export async function decideClaim(
  _previous: DecisionFormState,
  formData: FormData,
): Promise<DecisionFormState> {
  // The page checks this too; an action can be called without the page.
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/dashboard");

  const parsed = decisionSchema.safeParse({
    requestId: formData.get("requestId"),
    decision: formData.get("decision"),
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check the form and try again.",
    };
  }

  const { requestId, decision, notes } = parsed.data;
  const supabase = await createClient();

  // Row Level Security decides whether this admin may decide this request.
  // The database also writes the member's new status and the audit event.
  const { data, error } = await supabase
    .from("verification_requests")
    .update({
      status: decision === "approve" ? "approved" : "rejected",
      review_notes: notes || null,
    })
    .eq("id", requestId)
    .select("id");

  if (error) {
    if (error.code === "23505") {
      return {
        status: "error",
        message:
          "That student ID is already linked to another member. Check whether this person has a second account.",
      };
    }
    console.error("decision failed:", error.code);
    return {
      status: "error",
      message: "We could not save the decision. Nothing changed. Try again.",
    };
  }

  if (!data || data.length === 0) {
    return {
      status: "error",
      message: "This request was already decided, or it no longer exists.",
    };
  }

  redirect(`/admin/verifications?done=${decision}`);
}
