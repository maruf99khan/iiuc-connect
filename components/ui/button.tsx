import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

import { Icon, type IconName } from "./icons";

type Variant = "primary" | "quiet" | "ghost";
type Size = "md" | "lg";

const classes = (variant: Variant, size: Size, className?: string) =>
  cn("button", `button-${variant}`, size === "lg" && "button-lg", className);

type Common = {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  className?: string;
  children: ReactNode;
};

/** A link that looks like a button. Use for navigation; use Button for actions. */
export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  icon,
  className,
  children,
}: Common & { href: string }) {
  return (
    <Link href={href} className={classes(variant, size, className)}>
      {children}
      {icon ? <Icon name={icon} /> : null}
    </Link>
  );
}

export function Button({
  type = "button",
  disabled,
  variant = "primary",
  size = "md",
  icon,
  className,
  children,
}: Common & { type?: "button" | "submit"; disabled?: boolean }) {
  return (
    <button type={type} disabled={disabled} className={classes(variant, size, className)}>
      {children}
      {icon ? <Icon name={icon} /> : null}
    </button>
  );
}
