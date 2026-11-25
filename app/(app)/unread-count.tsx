import { connection } from "next/server";

import { createClient } from "@/lib/supabase/server";

/** A small count of unread notifications, pinned to the corner of the bell link. */
export async function UnreadCount() {
  // Per-member data: render at request time, never prerender or cache it.
  await connection();
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  if (error || !count) return null;
  return (
    <span
      aria-label={`${count} unread`}
      className="absolute top-0.5 right-0 inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] leading-5 font-bold text-background tabular-nums"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
