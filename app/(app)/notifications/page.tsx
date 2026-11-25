import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getCurrentUser } from "@/lib/auth/session";
import { formatDhaka } from "@/lib/mentorship/time";
import { notificationText } from "@/lib/notifications/text";
import { createClient } from "@/lib/supabase/server";

import { deleteNotification, markAllRead, openNotification } from "./actions";

export const metadata: Metadata = { title: "Notifications" };

// Fixed messages looked up by code, so nothing from the URL is shown as text.
const NOTICES = {
  allread: "Everything is marked as read.",
  deleted: "Notification deleted.",
} as const;

export default function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading notifications…</p>}>
      <Notifications searchParams={searchParams} />
    </Suspense>
  );
}

async function Notifications({
  searchParams,
}: Pick<PageProps<"/notifications">, "searchParams">) {
  const [params, user] = await Promise.all([searchParams, getCurrentUser()]);
  if (!user) redirect("/sign-in?next=/notifications");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) console.error("notifications page failed:", error.code);

  const rows = data ?? [];
  const unread = rows.filter((n) => n.read_at === null).length;
  const noticeKey = (Object.keys(NOTICES) as (keyof typeof NOTICES)[]).find(
    (key) => params[key] !== undefined,
  );

  return (
    <>
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-balance">Notifications</h1>
        <p className="max-w-prose leading-7 text-muted">
          What changed on your sessions and jobs. All times are Bangladesh time.
        </p>
        {unread > 0 ? (
          <form action={markAllRead}>
            <button type="submit" className="button button-quiet min-h-11 px-4 text-sm">
              Mark all as read
            </button>
          </form>
        ) : null}
      </div>

      {noticeKey ? (
        <p
          role="status"
          className="rounded-xl border border-border bg-surface px-4 py-3 text-sm leading-6"
        >
          {NOTICES[noticeKey]}
        </p>
      ) : null}
      {params.problem !== undefined ? (
        <p
          role="alert"
          className="rounded-xl border border-border bg-surface px-4 py-3 text-sm leading-6 text-danger"
        >
          That did not work. Reload the page and try again.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-danger">
          We could not load this. Reload the page.
        </p>
      ) : rows.length === 0 ? (
        <p className="leading-7 text-muted">
          Nothing yet. You will see session requests, answers and job applications here.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {rows.map((n) => (
            <li key={n.id} className="flex flex-col gap-2 py-4">
              <p className={n.read_at === null ? "font-semibold" : undefined}>
                {n.read_at === null ? <span className="sr-only">Unread: </span> : null}
                {notificationText(n.kind)}
              </p>
              <p className="text-sm text-muted">{formatDhaka(n.created_at)}</p>
              <div className="flex flex-wrap gap-3">
                <form action={openNotification}>
                  <input type="hidden" name="notificationId" value={n.id} />
                  <button type="submit" className="button button-quiet min-h-11 px-4 text-sm">
                    Open
                  </button>
                </form>
                <form action={deleteNotification}>
                  <input type="hidden" name="notificationId" value={n.id} />
                  <button type="submit" className="button button-quiet min-h-11 px-4 text-sm">
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
