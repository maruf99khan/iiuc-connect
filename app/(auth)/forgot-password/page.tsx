import type { Metadata } from "next";
import { Suspense } from "react";

import { ForgotPasswordForm } from "./forgot-form";

export const metadata: Metadata = { title: "Reset your password" };

// Messages are looked up by code so nothing from the URL is ever shown as text.
const NOTICES: Record<string, string> = {
  expired:
    "That link has expired or was already used. Ask for a new one below.",
};

export default function ForgotPasswordPage({
  searchParams,
}: PageProps<"/forgot-password">) {
  return (
    <>
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight">
          Reset your password
        </h1>
        <p className="leading-7 text-muted">
          Enter the email you signed up with. We will send a link to choose a
          new password.
        </p>
      </div>
      <Suspense fallback={<ForgotPasswordForm />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Form({
  searchParams,
}: Pick<PageProps<"/forgot-password">, "searchParams">) {
  const params = await searchParams;
  const notice =
    typeof params.notice === "string" ? NOTICES[params.notice] : undefined;
  return <ForgotPasswordForm notice={notice} />;
}
