import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { signOut } from "@/app/(auth)/actions";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { VERIFICATION_COPY, VERIFICATION_STEPS } from "@/lib/verification";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 py-6 sm:py-10">
      <header className="flex items-center justify-between gap-4">
        <Link href="/" className="wordmark">
          IIUC Connect
        </Link>
        <form action={signOut}>
          <button type="submit" className="button button-quiet min-h-11 px-4 text-sm">
            Sign out
          </button>
        </form>
      </header>

      <main className="mt-10 flex flex-col gap-8 sm:mt-14">
        <Suspense
          fallback={<p className="text-muted">Loading your account…</p>}
        >
          <AccountStatus />
        </Suspense>
      </main>
    </div>
  );
}

async function AccountStatus() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/sign-in?next=/dashboard");
  }

  // Row Level Security lets a member read their own row, so this needs no
  // privileged key.
  const supabase = await createClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("verification_status")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile) {
    return (
      <p role="alert" className="leading-7 text-danger">
        We could not load your account. Refresh the page to try again.
      </p>
    );
  }

  const copy = VERIFICATION_COPY[profile.verification_status];

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-balance">
          {copy.headline}
        </h1>
        {user.email ? (
          <p className="text-muted">
            Signed in as <span className="break-all">{user.email}</span>
          </p>
        ) : null}
      </div>

      <section aria-labelledby="steps-heading" className="flex flex-col gap-5">
        <h2 id="steps-heading" className="text-lg font-semibold">
          Your verification
        </h2>
        <ol className="flex flex-col">
          {VERIFICATION_STEPS.map((title, index) => {
            const done = index < copy.stepsDone;
            const current = index === copy.stepsDone;
            const last = index === VERIFICATION_STEPS.length - 1;

            return (
              <li
                key={title}
                aria-current={current ? "step" : undefined}
                className="flex gap-4"
              >
                <div className="flex flex-col items-center">
                  <StepMarker done={done} current={current} />
                  {last ? null : (
                    <span
                      aria-hidden="true"
                      className={`w-px flex-1 ${done ? "bg-brand" : "bg-border"}`}
                    />
                  )}
                </div>
                <div className={`flex flex-col gap-1 ${last ? "" : "pb-7"}`}>
                  <p
                    className={`leading-7 font-medium ${done || current ? "" : "text-muted"}`}
                  >
                    <span className="sr-only">
                      {done ? "Done: " : current ? "Current step: " : "Later: "}
                    </span>
                    {title}
                  </p>
                  {current && copy.detail ? (
                    <p className="max-w-prose leading-7 text-muted">
                      {copy.detail}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}

function StepMarker({ done, current }: { done: boolean; current: boolean }) {
  if (done) {
    return (
      <span
        aria-hidden="true"
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-on-brand"
      >
        <svg viewBox="0 0 16 16" className="size-4" fill="none">
          <path
            d="M3.5 8.5l3 3 6-7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`flex size-7 shrink-0 items-center justify-center rounded-full border-2 ${current ? "border-brand" : "border-border"}`}
    >
      {current ? <span className="size-2.5 rounded-full bg-brand" /> : null}
    </span>
  );
}
