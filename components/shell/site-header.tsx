import Image from "next/image";
import Link from "next/link";

import { LinkButton } from "@/components/ui/button";

/** Top bar of the public landing page. Sits over the hero, so it is transparent and light. */
export function SiteHeader() {
  return (
    <header className="absolute inset-x-0 top-0 z-20">
      <div className="mx-auto flex h-20 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight text-white no-underline hover:no-underline">
          <Image src="/brand/iiuc-crest.webp" alt="" width={36} height={38} priority className="h-9 w-auto" />
          IIUC Connect
        </Link>
        <nav aria-label="Account" className="flex items-center gap-2">
          <Link
            href="/sign-in"
            className="inline-flex min-h-11 items-center rounded-xl px-4 font-semibold text-white no-underline hover:bg-white/15 hover:no-underline"
          >
            Sign in
          </Link>
          <LinkButton href="/sign-up" variant="quiet" className="hidden sm:inline-flex">
            Create an account
          </LinkButton>
        </nav>
      </div>
    </header>
  );
}
