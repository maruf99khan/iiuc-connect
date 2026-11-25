import type { ReactNode } from "react";

/** The one h1 of a page, with an optional description and the page's main actions. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        <h1 className="text-4xl leading-[1.05] font-extrabold text-ink sm:text-[3.25rem]">{title}</h1>
        {description ? <p className="mt-2 max-w-prose text-lg text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </header>
  );
}
