import Image from "next/image";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { signOut } from "@/app/(auth)/actions";
import { UnreadCount } from "@/app/(app)/unread-count";
import { Icon } from "@/components/ui/icons";

import { TabBar, TopNav } from "./nav-links";

const iconLink =
  "relative inline-flex size-11 items-center justify-center rounded-xl text-foreground no-underline transition-colors duration-150 hover:bg-surface-2";

/**
 * The frame of every signed-in page: sticky top bar, bottom tab bar on phones, one wide
 * content column. Pages still check the session themselves; nothing here reads member data
 * except the unread count, which sits in its own Suspense boundary.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-surface">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-xl focus:bg-background focus:px-4 focus:py-3 focus:font-semibold focus:text-foreground focus:shadow-lift"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-border bg-background">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-2 px-4 sm:px-6">
          <Link href="/dashboard" className="wordmark flex items-center gap-2.5">
            <Image src="/brand/iiuc-crest.webp" alt="" width={32} height={34} priority className="h-8 w-auto" />
            IIUC Connect
          </Link>
          <TopNav className="ml-6 hidden md:block" />

          <div className="ml-auto flex items-center gap-1">
            <Link href="/notifications" className={iconLink}>
              <Icon name="bell" className="size-6" />
              <span className="sr-only">Notifications</span>
              <Suspense fallback={null}>
                <UnreadCount />
              </Suspense>
            </Link>
            <Link href="/profile" className={`${iconLink} hidden md:inline-flex`}>
              <Icon name="user" className="size-6" />
              <span className="sr-only">Profile</span>
            </Link>
            <form action={signOut}>
              <button type="submit" className="button button-quiet min-h-11 px-3 text-sm md:px-4">
                <Icon name="logout" />
                <span className="sr-only md:not-sr-only">Sign out</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      <main
        id="main"
        className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-6 pb-28 sm:px-6 sm:py-10 md:pb-12"
      >
        {children}
      </main>

      <TabBar />
    </div>
  );
}
