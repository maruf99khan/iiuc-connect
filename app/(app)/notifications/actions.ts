"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const idSchema = z.uuid();

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/notifications");
}

/** Marks one notification read, then goes where it points. */
export async function openNotification(formData: FormData) {
  await requireUser();
  const id = idSchema.safeParse(formData.get("notificationId"));
  if (!id.success) redirect("/notifications?problem=1");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id.data)
    .select("link")
    .maybeSingle();
  if (error) {
    console.error("open notification failed:", error.code);
    redirect("/notifications?problem=1");
  }
  // The database only stores paths inside the app; check again before redirecting.
  const link = data?.link;
  if (link && link.startsWith("/") && !link.startsWith("//")) redirect(link);
  redirect("/notifications");
}

/** Marks every unread notification read. */
export async function markAllRead() {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (error) {
    console.error("mark all read failed:", error.code);
    redirect("/notifications?problem=1");
  }
  redirect("/notifications?allread=1");
}

/** Deletes one notification. */
export async function deleteNotification(formData: FormData) {
  await requireUser();
  const id = idSchema.safeParse(formData.get("notificationId"));
  if (!id.success) redirect("/notifications?problem=1");
  const supabase = await createClient();
  const { error } = await supabase.from("notifications").delete().eq("id", id.data);
  if (error) {
    console.error("delete notification failed:", error.code);
    redirect("/notifications?problem=1");
  }
  redirect("/notifications?deleted=1");
}
