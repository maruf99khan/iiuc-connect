import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { safeNextPath } from "@/lib/auth/schemas";
import { getCurrentUser } from "@/lib/auth/session";

import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Sign in" };

// Messages are looked up by code so nothing from the URL is ever shown as text.
const NOTICES: Record<string, string> = {
  "confirm-failed":
    "That link did not sign you in. It may have expired, or been opened in a different browser. If your email is already confirmed, sign in below.",
};

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Sign in</h1>
      {/* The plain form is the static shell; the request-aware one replaces it. */}
      <Suspense fallback={<AuthForm mode="sign-in" />}>
        <SignInForm searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function SignInForm({
  searchParams,
}: Pick<PageProps<"/sign-in">, "searchParams">) {
  const [params, user] = await Promise.all([searchParams, getCurrentUser()]);
  const next = safeNextPath(params.next);

  if (user) {
    redirect(next);
  }

  const notice =
    typeof params.notice === "string" ? NOTICES[params.notice] : undefined;

  return <AuthForm mode="sign-in" next={next} notice={notice} />;
}
