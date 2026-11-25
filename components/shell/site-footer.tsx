import Image from "next/image";

/** Footer of the public landing page. Says only what is true. */
export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex w-full max-w-6xl items-start gap-3 px-4 py-10 sm:px-6">
        <Image src="/brand/iiuc-crest.webp" alt="" width={32} height={34} className="h-8 w-auto" />
        <div>
          <p className="font-extrabold tracking-tight">IIUC Connect</p>
          <p className="mt-1 max-w-md text-sm text-muted">
            A CSE undergraduate thesis project for International Islamic University Chittagong. Free to use.
          </p>
        </div>
      </div>
    </footer>
  );
}
