import type { ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

import { Icon, type IconName } from "./icons";

export type Tone = "neutral" | "brand" | "accent" | "ink" | "warn" | "danger";

/** Tinted fills over the page, text in the full colour: every pair is checked by the audit. */
const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-foreground",
  brand: "bg-brand/10 text-brand",
  accent: "bg-accent/10 text-accent",
  ink: "bg-ink/10 text-ink",
  warn: "bg-warn/15 text-warn",
  danger: "bg-danger/10 text-danger",
};

/** A short status or category label: Alumni, Verified, CSE, Full-time. */
export function Badge({
  tone = "neutral",
  icon,
  children,
}: {
  tone?: Tone;
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tones[tone],
      )}
    >
      {icon ? <Icon name={icon} className="size-3.5" /> : null}
      {children}
    </span>
  );
}

/** A skill or tag. Outlined, so it never competes with a Badge. */
export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-sm text-foreground">
      {children}
    </span>
  );
}
