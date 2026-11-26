import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { sendEmail } from "@/lib/email";
import { publicEnv } from "@/lib/env";
import { isAuthorizedCron, parseCronEnv } from "@/lib/evidence/cron";
import type { Database } from "@/types/database.types";

// Mirror of lib/notifications/text.ts — inline to avoid a client/server import boundary.
const NOTIFICATION_TEXT: Record<string, string> = {
  request_received: "You have a new session request.",
  request_accepted: "A graduate accepted your session request.",
  request_declined: "A graduate declined your session request.",
  request_cancelled: "A session was cancelled.",
  request_expired: "Your session request expired with no answer.",
  application_received: "Someone applied to your job.",
  application_shortlisted: "You were shortlisted for a job.",
  application_rejected: "A job application was not taken forward.",
  application_withdrawn: "An applicant withdrew from your job.",
};

const BATCH = 50;

/**
 * Sends email notifications for any notification rows that have not yet been
 * emailed. Called by Vercel Cron every 5 minutes (see vercel.json).
 * Requires CRON_SECRET, SUPABASE_SECRET_KEY, RESEND_API_KEY and
 * NOTIFICATIONS_FROM. Returns { skipped: true } instead of an error when the
 * email vars are absent, so the job is safe to deploy before the sender is set.
 */
export async function GET(request: NextRequest) {
  const env = parseCronEnv(process.env);
  if (!env.ok) {
    console.error("send-notifications: not configured:", env.missing.join(", "));
    return NextResponse.json({ error: "Not configured.", missing: env.missing }, { status: 503 });
  }
  if (!isAuthorizedCron(request.headers.get("authorization"), env.data.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!process.env.RESEND_API_KEY || !process.env.NOTIFICATIONS_FROM) {
    return NextResponse.json({ skipped: true, reason: "RESEND_API_KEY or NOTIFICATIONS_FROM not set." });
  }

  const supabase = createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    env.data.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // Rows created in the last 24 h that have not been emailed yet.
  const { data: rows, error } = await supabase
    .from("notifications")
    .select("id, user_id, kind")
    .is("emailed_at", null)
    .gte("created_at", new Date(Date.now() - 86_400_000).toISOString())
    .order("created_at")
    .limit(BATCH);

  if (error) {
    console.error("send-notifications: query failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!rows?.length) return NextResponse.json({ sent: 0 });

  // Fetch emails for the affected users. listUsers() pages at 50 by default;
  // ponytail: single page — paginate if membership grows past a few hundred.
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const { data: userData, error: userError } = await supabase.auth.admin.listUsers();
  if (userError) {
    console.error("send-notifications: could not fetch users:", userError.message);
    return NextResponse.json({ error: userError.message }, { status: 500 });
  }
  const emailById = new Map(
    (userData?.users ?? [])
      .filter((u) => userIds.includes(u.id) && u.email)
      .map((u) => [u.id, u.email!]),
  );

  let sent = 0;
  const sentIds: string[] = [];
  for (const row of rows) {
    const to = emailById.get(row.user_id);
    if (!to) continue;
    const body = NOTIFICATION_TEXT[row.kind] ?? "You have a new notification.";
    const ok = await sendEmail(to, `IIUC Connect — ${body}`, `${body}\n\nLog in to view it: https://iiuc-connect.vercel.app`);
    if (ok) { sent++; sentIds.push(row.id); }
  }

  if (sentIds.length) {
    const { error: updateError } = await supabase
      .from("notifications")
      .update({ emailed_at: new Date().toISOString() })
      .in("id", sentIds);
    if (updateError) console.error("send-notifications: could not mark sent:", updateError.message);
  }

  return NextResponse.json({ sent });
}
