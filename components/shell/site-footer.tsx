import Image from "next/image";
import Link from "next/link";

/** Footer of the public landing page. Says only what is true. */
export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <Image src="/brand/iiuc-crest.webp" alt="" width={32} height={34} className="h-8 w-auto" />
          <div>
            <p className="font-extrabold tracking-tight">IIUC Connect</p>
            <p className="mt-1 max-w-md text-sm text-muted">
              A CSE undergraduate thesis project for International Islamic University Chittagong. Free to use.
            </p>
          </div>
        </div>
        <nav aria-label="Footer" className="flex gap-6 text-sm font-semibold">
          <Link href="/sign-in">Sign in</Link>
          <Link href="/sign-up">Create account</Link>
        </nav>
      </div>
    </footer>
  );
}
