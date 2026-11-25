import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

import { Icon } from "./icons";

/**
 * The frame every list in the app uses (D-031): a filter rail beside the results.
 * From lg the rail is a sticky column; below that it folds into a "Filters" disclosure, which
 * needs no JavaScript. The rail content is rendered twice and one copy is always display:none.
 */
export function BrowseLayout({
  rail,
  railLabel = "Filters",
  children,
}: {
  rail: ReactNode;
  railLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-10">
      <details className="group rounded-2xl border border-border bg-background lg:hidden">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 font-semibold [&::-webkit-details-marker]:hidden">
          <Icon name="menu" />
          {railLabel}
          <Icon name="chevron-down" className="ml-auto transition-transform duration-150 group-open:rotate-180" />
        </summary>
        <div className="flex flex-col gap-6 border-t border-border p-4">{rail}</div>
      </details>
      <aside aria-label={railLabel} className="hidden lg:block">
        <div className="sticky top-24 flex flex-col gap-6 rounded-2xl border border-border bg-background p-5">
          {rail}
        </div>
      </aside>
      <div className="flex min-w-0 flex-col gap-6">{children}</div>
    </div>
  );
}

/**
 * Results with an always-visible panel beside them (your applications, your sessions). From lg the
 * panel is a sticky column on the right; below that it stacks under the results. Nothing is hidden
 * behind a disclosure, so a control inside it is always reachable.
 */
export function SidePanelLayout({
  panel,
  panelLabel,
  children,
}: {
  panel: ReactNode;
  panelLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-10">
      <div className="flex min-w-0 flex-col gap-6">{children}</div>
      <aside aria-label={panelLabel} className="lg:sticky lg:top-24 lg:self-start">
        <div className="flex flex-col gap-6 rounded-2xl border border-border bg-background p-5">{panel}</div>
      </aside>
    </div>
  );
}

/** A titled set of choices inside the rail. */
export function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-bold">{title}</h2>
      <ul className="mt-2 flex flex-col gap-1">{children}</ul>
    </section>
  );
}

/** One choice, as a link, so a filter is a URL: shareable, back-button friendly, no JavaScript. */
export function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "true" : undefined}
        className={cn(
          "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold no-underline transition-colors duration-150",
          active ? "bg-brand/10 text-brand" : "text-foreground hover:bg-surface-2",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 rounded-full border-2",
            active
              ? "border-brand bg-brand shadow-[inset_0_0_0_2px_var(--background)]"
              : "border-[var(--field-border)]",
          )}
        />
        {children}
      </Link>
    </li>
  );
}
