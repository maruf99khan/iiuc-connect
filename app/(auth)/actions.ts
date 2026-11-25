"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { RecoveryFormState } from "@/lib/auth/form-state";
import {
  DEFAULT_SIGNED_IN_PATH,
  emailOnlySchema,
  newPasswordSchema,
  safeNextPath,
  signInSchema,
  signUpSchema,
} from "@/lib/auth/schemas";
import { getCurrentUser } from "@/lib/auth/session";
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
        code: "email_not_confirmed",
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

/**
 * Emails a password-reset link. The answer is the same whether or not the
 * address has an account, so this cannot be used to find out who is registered.
 */
export async function requestPasswordReset(
  _previous: RecoveryFormState,
  formData: FormData,
): Promise<RecoveryFormState> {
  const parsed = emailOnlySchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
      email: typedEmail(formData),
    };
  }

  const { email } = parsed.data;
  const origin = (await headers()).get("origin");
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: origin ? `${origin}/auth/reset` : undefined,
  });

  if (error) {
    const limited = rateLimitMessage(error.code);
    if (limited) return { status: "error", message: limited, email };
    console.error("password reset request failed:", error.code ?? error.name);
    return {
      status: "error",
      message: "We could not send the email. Try again in a moment.",
      email,
    };
  }

  return { status: "done", email };
}

/** Sends the sign-up confirmation email again. Same answer for every address. */
export async function resendConfirmation(
  _previous: RecoveryFormState,
  formData: FormData,
): Promise<RecoveryFormState> {
  const parsed = emailOnlySchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
      email: typedEmail(formData),
    };
  }

  const { email } = parsed.data;
  const origin = (await headers()).get("origin");
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: origin ? { emailRedirectTo: `${origin}/auth/confirm` } : undefined,
  });

  if (error) {
    const limited = rateLimitMessage(error.code);
    if (limited) return { status: "error", message: limited, email };
    console.error("resend confirmation failed:", error.code ?? error.name);
    return {
      status: "error",
      message: "We could not send the email. Try again in a moment.",
      email,
    };
  }

  return { status: "done", email };
}

/** Sets a new password for the signed-in member (the reset link signs them in). */
export async function updatePassword(
  _previous: RecoveryFormState,
  formData: FormData,
): Promise<RecoveryFormState> {
  if (!(await getCurrentUser())) {
    redirect("/forgot-password?notice=expired");
  }

  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    if (error.code === "same_password") {
      return {
        status: "error",
        fieldErrors: { password: ["Choose a password you have not used before."] },
      };
    }
    if (error.code === "weak_password") {
      return {
        status: "error",
        fieldErrors: {
          password: ["That password is too easy to guess. Try a longer one."],
        },
      };
    }
    const limited = rateLimitMessage(error.code);
    if (limited) return { status: "error", message: limited };
    console.error("password update failed:", error.code ?? error.name);
    return {
      status: "error",
      message:
        "We could not change your password. Ask for a new reset link and try again.",
    };
  }

  // End every other session, so a session someone else already holds does not
  // survive the reset.
  await supabase.auth.signOut({ scope: "others" });
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
