"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon, type IconName } from "@/components/ui/icons";
import { cn } from "@/lib/ui/cn";

type Item = { href: string; label: string; tab: string; icon: IconName; match: string[] };

const items: Item[] = [
  { href: "/dashboard", label: "Dashboard", tab: "Home", icon: "home", match: ["/dashboard"] },
  { href: "/directory", label: "Directory", tab: "Directory", icon: "users", match: ["/directory", "/members"] },
  { href: "/sessions", label: "Sessions", tab: "Sessions", icon: "calendar", match: ["/sessions"] },
  { href: "/jobs", label: "Jobs", tab: "Jobs", icon: "briefcase", match: ["/jobs"] },
];

const profile: Item = { href: "/profile", label: "Profile", tab: "Profile", icon: "user", match: ["/profile", "/verify"] };

const isActive = (pathname: string, item: Item) =>
  item.match.some((m) => pathname === m || pathname.startsWith(`${m}/`));

/** Top navigation from md up. Only one of this and TabBar is ever visible. */
export function TopNav({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className={className}>
      <ul className="flex items-center gap-1">
        {items.map((item) => {
          const active = isActive(pathname, item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-16 items-center px-4 text-sm font-semibold no-underline transition-colors duration-150",
                  active ? "text-foreground shadow-[inset_0_-3px_0_var(--accent)]" : "text-muted hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Fixed bottom tab bar below md: five places, thumb height, labelled. */
export function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {[...items, profile].map((item) => {
          const active = isActive(pathname, item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold no-underline transition-colors duration-150",
                  active ? "text-brand" : "text-muted",
                )}
              >
                <Icon name={item.icon} className={cn("size-6", active && "stroke-[2.25]")} />
                {item.tab}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
