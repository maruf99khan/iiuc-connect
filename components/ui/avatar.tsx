import { avatarTint, initials } from "@/lib/ui/avatar";
import { cn } from "@/lib/ui/cn";

/** Six calm tints from the palette; the same id always gets the same one. */
const tints = [
  "bg-brand/15 text-brand",
  "bg-accent/12 text-accent",
  "bg-ink/12 text-ink",
  "bg-warn/15 text-warn",
  "bg-foreground/10 text-foreground",
  "bg-brand-strong/15 text-brand-strong",
] as const;

const sizes = {
  32: "size-8 text-xs",
  40: "size-10 text-sm",
  56: "size-14 text-lg",
  96: "size-24 text-3xl",
} as const;

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
