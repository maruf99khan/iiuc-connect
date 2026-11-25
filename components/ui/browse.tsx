import type { ReactNode } from "react";

/**
 * Results with an always-visible panel beside them (your applications, manage this job). From lg
 * the panel is a sticky column on the right; below that it stacks under the results. Nothing is
 * hidden behind a disclosure, so a control inside it is always reachable.
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
        <div className="flex flex-col gap-6 rounded-md rounded-tr-[2.75rem] border border-border bg-surface p-6">
          {panel}
        </div>
      </aside>
    </div>
  );
}
