import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col px-5 py-8 sm:py-14">
      <Link href="/" className="wordmark self-start">
        IIUC Connect
      </Link>
      <main className="mt-10 flex flex-col gap-6">{children}</main>
    </div>
  );
}
