import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database.types";

/**
 * Refreshes the Supabase session on each request and writes the refreshed
 * cookies (and no-store cache headers) onto the response.
 *
 * This is defence in depth and session upkeep only. Authorization is
 * enforced by Row Level Security in the database.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Create a new client per request; never share one across requests.
  const supabase = createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value),
          );
        },
      },
    },
  );

  // Do not add code between creating the client and getClaims(): doing so
  // can cause users to be signed out at random. getClaims() verifies the
  // token signature and refreshes the session if it has expired.
  await supabase.auth.getClaims();

  // The response object must be returned as-is so the refreshed cookies
  // reach the browser.
  return supabaseResponse;
}
