"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import type { ProfileFormState } from "@/lib/profile/form-state";
import { fullNameSchema, profileSchema } from "@/lib/profile/schema";
import { createClient } from "@/lib/supabase/server";
import { isVerified } from "@/lib/verification/status";

const FIELDS = [
  "fullName",
  "headline",
  "bio",
  "jobTitle",
  "company",
  "location",
  "industry",
  "skills",
  "linkedinUrl",
  "portfolioUrl",
  "githubUrl",
  "visibility",
] as const;

function echo(formData: FormData): ProfileFormState["values"] {
  const values: NonNullable<ProfileFormState["values"]> = {};
  for (const field of FIELDS) {
    const value = formData.get(field);
    if (typeof value === "string") values[field] = value.slice(0, 2100);
  }
  return values;
}

export async function saveProfile(
  _previous: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/profile");

  const values = echo(formData);
  const supabase = await createClient();

  const { data: current } = await supabase
    .from("profiles")
    .select("verification_status")
    .eq("id", user.id)
    .maybeSingle();
  if (!current) {
    return {
      status: "error",
      message: "We could not load your profile. Refresh the page and try again.",
      values,
    };
  }

  // A verified member's name is fixed (the database enforces it too), so the
  // name field is only read for members who are not verified yet.
  const nameLocked = isVerified(current.verification_status);
  const parsed = profileSchema.safeParse(
    Object.fromEntries(FIELDS.map((f) => [f, formData.get(f)])),
  );
  const name = nameLocked
    ? null
    : fullNameSchema.safeParse(formData.get("fullName"));

  if (!parsed.success || (name && !name.success)) {
    return {
      status: "error",
      message: "Some details need fixing. Check the fields marked below.",
      fieldErrors: {
        ...(parsed.success ? {} : z.flattenError(parsed.error).fieldErrors),
        ...(name && !name.success
          ? { fullName: name.error.issues.map((i) => i.message) }
          : {}),
      },
      values,
    };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      ...parsed.data,
      ...(name?.success ? { full_name: name.data } : {}),
    })
    .eq("id", user.id);

  if (error) {
    console.error("profile save failed:", error.code);
    return {
      status: "error",
      message: "We could not save your profile. Nothing changed. Try again.",
      values,
    };
  }

  redirect("/profile?saved=1");
}
