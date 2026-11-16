import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database.types";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * It is bound to the current user's session cookie and uses the publishable
 * key, so Row Level Security applies exactly as it does in the browser.
 * This is deliberate (Decision D-006): the privileged key is never used for
 * ordinary requests.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components cannot write cookies. This is expected:
            // proxy.ts refreshes the session and writes cookies on every
            // request, so nothing is lost here.
          }
        },
      },
    },
  );
}
