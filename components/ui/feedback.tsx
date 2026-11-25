import type { ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

import { Icon, type IconName } from "./icons";

/** A shimmering placeholder. Size it with classes; it is hidden from assistive technology. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("skeleton", className)} />;
}

/** Says what is missing and what to do next, instead of "nothing here". */
export function EmptyState({
  icon = "search",
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-background px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-surface-2 text-muted">
        <Icon name={icon} className="size-6" />
      </span>
      <h2 className="mt-4 text-lg font-bold">{title}</h2>
      {description ? <p className="mt-1 max-w-md text-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

const alertTones = {
  info: { icon: "info", box: "bg-ink/8", mark: "text-ink" },
  success: { icon: "check", box: "bg-brand/10", mark: "text-brand" },
  warn: { icon: "alert", box: "bg-warn/12", mark: "text-warn" },
  danger: { icon: "alert", box: "bg-danger/10", mark: "text-danger" },
} as const satisfies Record<string, { icon: IconName; box: string; mark: string }>;

/** An inline message. Danger interrupts a screen reader; the others wait politely. */
export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: keyof typeof alertTones;
  title?: string;
  children?: ReactNode;
}) {
  const t = alertTones[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-xl p-4 text-foreground", t.box)}
    >
      <Icon name={t.icon} className={cn("mt-0.5", t.mark)} />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && "mt-0.5", "text-muted")}>{children}</div> : null}
      </div>
    </div>
  );
}
