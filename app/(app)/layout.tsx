import Link from "next/link";
import type { ReactNode } from "react";

import { signOut } from "@/app/(auth)/actions";

/** Shared frame for every signed-in page. Each page still checks the session. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 py-6 sm:py-10">
      <header className="flex items-center justify-between gap-4">
        <Link href="/dashboard" className="wordmark">
          IIUC Connect
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className="button button-quiet min-h-11 px-4 text-sm"
          >
            Sign out
          </button>
        </form>
      </header>

      <nav aria-label="Main" className="mt-5 flex gap-6 text-sm font-medium">
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/directory">Directory</Link>
        <Link href="/sessions">Sessions</Link>
        <Link href="/profile">Profile</Link>
      </nav>

      <main className="mt-10 flex flex-col gap-8 sm:mt-14">{children}</main>
    </div>
  );
}
