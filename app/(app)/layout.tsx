import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";

/** Shared frame for every signed-in page. Each page still checks the session. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
