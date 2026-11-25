import type { ReactNode } from "react";

import { avatarTint, initials } from "@/lib/ui/avatar";
import { cn } from "@/lib/ui/cn";

/** Six calm tints from the palette; the same id always gets the same one. */
const tints = [
  "bg-brand/15 text-brand",
  "bg-accent/12 text-accent",
  "bg-ink/12 text-ink",
  "bg-warn/15 text-warn",
  "bg-accent/20 text-accent",
  "bg-ink/20 text-ink",
] as const;

const sizes = {
  32: "size-8 text-xs",
  40: "size-10 text-sm",
  56: "size-14 text-lg",
  96: "size-24 text-3xl",
} as const;

/**
 * The large initials block of the editorial design (D-032): one corner is deeply rounded.
 * It stands where a photo would; the name is always written under or beside it.
 */
export function Portrait({
  id,
  name,
  className,
  children,
}: {
  id: string;
  name: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative flex aspect-[10/11] w-full items-center justify-center overflow-hidden rounded-md rounded-tr-[2.75rem]",
        tints[avatarTint(id)],
        className,
      )}
    >
      <span aria-hidden="true" className="text-5xl font-extrabold tracking-tight select-none sm:text-6xl">
        {initials(name)}
      </span>
      {children ? <div className="absolute bottom-3 left-3">{children}</div> : null}
    </div>
  );
}

/** Initials in a coloured circle. Decorative: the name is always written next to it. */
export function Avatar({
  id,
  name,
  size = 40,
  className,
}: {
  id: string;
  name: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold tracking-tight select-none",
        sizes[size],
        tints[avatarTint(id)],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
