import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { DEFAULT_SIGNED_IN_PATH } from "@/lib/auth/schemas";
import { getCurrentUser } from "@/lib/auth/session";

import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Create an account" };

export default function SignUpPage() {
  return (
    <>
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight">
          Create an account
        </h1>
        <p className="leading-7 text-muted">
          An account is the first step. After you confirm your email, we check
          that you are an IIUC student or graduate.
        </p>
      </div>
      <Suspense fallback={<AuthForm mode="sign-up" />}>
        <SignUpForm />
      </Suspense>
    </>
  );
}

async function SignUpForm() {
  if (await getCurrentUser()) {
    redirect(DEFAULT_SIGNED_IN_PATH);
  }

  return <AuthForm mode="sign-up" />;
}
