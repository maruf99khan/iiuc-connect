import type { ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

/**
 * A bordered panel. Elevation is declared once: a hairline at rest, a lift on hover for
 * interactive cards. For a clickable card put one link inside and give it
 * `text-foreground no-underline after:absolute after:inset-0` so the whole card is the target
 * (links are green by default); the card shows the focus ring.
 */
export function Card({
  as: Tag = "div",
  padded = true,
  interactive = false,
  className,
  children,
}: {
  as?: "div" | "section" | "article" | "li" | "aside";
  padded?: boolean;
  interactive?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag
      className={cn(
        "relative rounded-2xl border border-border bg-background",
        padded && "p-5 sm:p-6",
        interactive &&
          "transition-[box-shadow,transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-transparent hover:shadow-lift has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
