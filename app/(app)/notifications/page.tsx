import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Alert, EmptyState, Skeleton } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { formatDhaka } from "@/lib/mentorship/time";
import { notificationText } from "@/lib/notifications/text";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/ui/cn";

import { deleteNotification, markAllRead, openNotification } from "./actions";

export const metadata: Metadata = { title: "Notifications" };

// Fixed messages looked up by code, so nothing from the URL is shown as text.
const NOTICES = {
  allread: "Everything is marked as read.",
  deleted: "Notification deleted.",
} as const;

const DESCRIPTION = "What changed on your sessions and jobs. All times are Bangladesh time.";

export default function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  return (
    <Suspense fallback={<NotificationsSkeleton />}>
      <Notifications searchParams={searchParams} />
    </Suspense>
  );
}

function NotificationsSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title="Notifications" description={DESCRIPTION} />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-24 rounded-2xl" />
      ))}
    </div>
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title="Notifications"
        description={DESCRIPTION}
        actions={
          unread > 0 ? (
            <form action={markAllRead}>
              <button type="submit" className="button button-quiet">
                <Icon name="check" />
                Mark all as read
              </button>
            </form>
          ) : undefined
        }
      />

      {noticeKey ? <Alert tone="success">{NOTICES[noticeKey]}</Alert> : null}
      {params.problem !== undefined ? (
        <Alert tone="danger">That did not work. Reload the page and try again.</Alert>
      ) : null}

      {error ? (
        <Alert tone="danger">We could not load this. Reload the page.</Alert>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="bell"
          title="Nothing yet."
          description="You will see session requests, answers and job applications here."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((n) => {
            const isUnread = n.read_at === null;
            const job = n.kind.includes("job") || n.kind.includes("application");
            return (
              <li
                key={n.id}
                className={cn(
                  "flex flex-col gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center sm:p-5",
                  isUnread ? "border-brand/40 bg-background" : "border-border bg-surface",
                )}
              >
                <span
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-xl",
                    isUnread ? "bg-brand/10 text-brand" : "bg-surface-2 text-muted",
                  )}
                >
                  <Icon name={job ? "briefcase" : "calendar"} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={isUnread ? "font-bold" : undefined}>
                    {isUnread ? <span className="sr-only">Unread: </span> : null}
                    {notificationText(n.kind)}
                  </p>
                  <p className="mt-0.5 text-sm text-muted">{formatDhaka(n.created_at)}</p>
                </div>
                <div className="flex gap-2">
                  <form action={openNotification}>
                    <input type="hidden" name="notificationId" value={n.id} />
                    <button type="submit" className="button button-primary min-h-11 px-4 text-sm">
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
            );
          })}
        </ul>
      )}
    </div>
  );
}
