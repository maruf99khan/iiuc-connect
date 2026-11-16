"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  DEFAULT_SIGNED_IN_PATH,
  safeNextPath,
  signInSchema,
  signUpSchema,
} from "@/lib/auth/schemas";
import { createClient } from "@/lib/supabase/server";

import type { AuthFormState } from "./auth-form";

const RATE_LIMITED = "Too many attempts. Wait a few minutes, then try again.";

// Supabase caps how many emails a project may send per hour, and the cap is
// low until the project has its own SMTP provider. The wording is the same
// whether or not the address has an account, so it reveals nothing.
const EMAIL_LIMIT =
  "We cannot send another email right now. If you signed up earlier, open the link in the email we already sent. Otherwise try again in about an hour.";

function rateLimitMessage(code: string | undefined) {
  if (code === "over_email_send_rate_limit") return EMAIL_LIMIT;
  if (code === "over_request_rate_limit") return RATE_LIMITED;
  return null;
}

/** The email as typed, so the form can show it again after an error. */
function typedEmail(formData: FormData) {
  const value = formData.get("email");
  return typeof value === "string" ? value.slice(0, 254) : "";
}

export async function signUp(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
      email: typedEmail(formData),
    };
  }

  const { email, password } = parsed.data;
  // Next.js rejects Server Action requests whose Origin does not match the
  // host, so this is our own origin. Supabase also checks the redirect
  // against the project's allow-list before using it.
  const origin = (await headers()).get("origin");
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: origin
      ? { emailRedirectTo: `${origin}/auth/confirm` }
      : undefined,
  });

  if (error) {
    if (error.code === "weak_password") {
      return {
        status: "error",
        fieldErrors: {
          password: ["That password is too easy to guess. Try a longer one."],
        },
        email,
      };
    }
    if (error.code === "email_address_invalid") {
      return {
        status: "error",
        fieldErrors: { email: ["That email address cannot be used here."] },
        email,
      };
    }
    const limited = rateLimitMessage(error.code);
    if (limited) {
      return { status: "error", message: limited, email };
    }
    // Do not say whether the address already has an account: that would let
    // anyone test which emails are registered.
    if (error.code !== "user_already_exists") {
      console.error("signUp failed:", error.code ?? error.name);
      return {
        status: "error",
        message: "We could not create the account. Try again in a moment.",
        email,
      };
    }
  }

  // Only happens when email confirmation is switched off for the project.
  if (data.session) {
    redirect(DEFAULT_SIGNED_IN_PATH);
  }

  return { status: "sent", email };
}

export async function signIn(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
      email: typedEmail(formData),
    };
  }

  const { email, password } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.code === "email_not_confirmed") {
      return {
        status: "error",
        message:
          "Confirm your email first. Open the link we sent when you signed up.",
        email,
      };
    }
    const limited = rateLimitMessage(error.code);
    if (limited) {
      return { status: "error", message: limited, email };
    }
    if (error.code !== "invalid_credentials") {
      console.error("signIn failed:", error.code ?? error.name);
    }
    return {
      status: "error",
      message: "Incorrect email or password.",
      email,
    };
  }

  redirect(safeNextPath(formData.get("next")));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
