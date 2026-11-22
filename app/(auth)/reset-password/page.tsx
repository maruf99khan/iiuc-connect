import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getCurrentUser } from "@/lib/auth/session";

import { ResetPasswordForm } from "./reset-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <>
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight">
          Choose a new password
        </h1>
        <p className="leading-7 text-muted">
          After you save it, you stay signed in here and are signed out
          everywhere else.
        </p>
      </div>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Guarded />
      </Suspense>
    </>
  );
}

/** Only someone the reset link signed in (or any signed-in member) gets the form. */
async function Guarded() {
  if (!(await getCurrentUser())) {
    redirect("/forgot-password?notice=expired");
  }
  return <ResetPasswordForm />;
}
