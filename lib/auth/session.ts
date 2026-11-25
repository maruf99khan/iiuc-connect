import "server-only";

import { io } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string | null;
};

/**
 * The signed-in user, or null.
 *
 * getClaims() verifies the token's signature, so the id can be trusted for
 * display and for deciding where to redirect. It is not an authorization
 * check: Row Level Security decides what this user may read or change.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  // Checking a token's expiry reads the clock, and Cache Components refuses a
  // clock read inside the prerendered shell. io() keeps everything after this
  // line at request time, which is right for per-member content anyway.
  await io();

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims?.sub) {
    return null;
  }

  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
  };
}
