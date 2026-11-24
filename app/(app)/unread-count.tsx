import { createClient } from "@/lib/supabase/server";

/** A small count of unread notifications, shown next to the nav link. */
export async function UnreadCount() {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  if (error || !count) return null;
  return (
    <span
      aria-label={`${count} unread`}
      className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full border border-border px-1.5 text-xs"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
