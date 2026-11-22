import "server-only";

import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in user, only when they are an admin. Pages use it to decide
 * what to show; it is not what protects the data. Row Level Security refuses
 * a non-admin's reads and writes on its own.
 */
export async function getCurrentAdmin(): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return data?.role === "admin" ? user : null;
}
