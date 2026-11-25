import Link from "next/link";

import { cn } from "@/lib/ui/cn";

import { Icon } from "./icons";

/** A row of links that filter one list (All, Alumni, Students). Not tabs: each one is a page. */
export function Segmented({
  label,
  options,
}: {
  label: string;
  options: ReadonlyArray<{ label: string; href: string; active: boolean }>;
}) {
  return (
    <nav aria-label={label} className="inline-flex rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <Link
          key={o.label}
          href={o.href}
          aria-current={o.active ? "true" : undefined}
          className={cn(
            "inline-flex min-h-10 items-center rounded-lg px-4 text-sm font-semibold no-underline transition-colors duration-150",
            o.active
              ? "bg-background text-foreground"
              : "text-muted hover:text-foreground",
          )}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}

/** Previous and next with the position between them. Missing neighbours are shown disabled. */
export function Pagination({
  page,
  pageCount,
  hrefFor,
  previousLabel = "Previous",
  nextLabel = "Next",
}: {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
  previousLabel?: string;
  nextLabel?: string;
}) {
  if (pageCount <= 1) return null;
  const step = (label: string, to: number, enabled: boolean, next: boolean) => {
    const inner = (
      <>
        {!next && <Icon name="arrow-right" className="rotate-180" />}
        {label}
        {next && <Icon name="arrow-right" />}
      </>
    );
    return enabled ? (
      <Link href={hrefFor(to)} className="button button-quiet">
        {inner}
      </Link>
    ) : (
      <span aria-disabled="true" className="button button-quiet cursor-not-allowed opacity-50">
        {inner}
      </span>
    );
  };
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-4">
      {step(previousLabel, page - 1, page > 1, false)}
      <p className="text-sm text-muted tabular-nums">
        Page {page} of {pageCount}
      </p>
      {step(nextLabel, page + 1, page < pageCount, true)}
    </nav>
  );
}
