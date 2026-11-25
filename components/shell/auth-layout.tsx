import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Sign-in, sign-up and password pages. From lg the campus photo takes the left half; below that
 * the form has the whole screen. The page supplies its own h1 and form.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-full flex-1 lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-ink lg:block">
        <Image
          src="/brand/campus-aerial.webp"
          alt=""
          fill
          priority
          sizes="50vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-linear-to-t from-ink/95 via-ink/55 to-ink/20" />
        <div className="relative z-10 flex h-full flex-col justify-between p-12 text-white">
          <Link href="/" className="flex items-center gap-3 text-white no-underline hover:no-underline">
            <Image src="/brand/iiuc-crest.webp" alt="" width={44} height={46} className="h-11 w-auto" />
            <span className="text-xl font-extrabold tracking-tight">IIUC Connect</span>
          </Link>
          <div className="max-w-md">
            <p className="text-3xl leading-tight font-extrabold">
              Students and graduates of IIUC, in one verified place.
            </p>
            <p className="mt-3 text-lg text-white/85">
              Every member is checked against IIUC records before they appear in the directory.
            </p>
          </div>
        </div>
      </aside>

      <div className="flex flex-col bg-background px-5 py-8 sm:px-10">
        <Link href="/" className="wordmark flex items-center gap-2.5 self-start lg:hidden">
          <Image src="/brand/iiuc-crest.webp" alt="" width={32} height={34} className="h-8 w-auto" />
          IIUC Connect
        </Link>
        <main className="m-auto flex w-full max-w-md flex-col gap-6 py-10">{children}</main>
      </div>
    </div>
  );
}
