import type { NextRequest } from "next/server";

import { handleEmailLink } from "@/lib/auth/email-link";
import { DEFAULT_SIGNED_IN_PATH } from "@/lib/auth/schemas";

/**
 * Landing point for the sign-up confirmation link Supabase emails. See
 * lib/auth/email-link.ts for the two link shapes it accepts.
 */
export function GET(request: NextRequest) {
  return handleEmailLink(request, {
    defaultNext: DEFAULT_SIGNED_IN_PATH,
    onFailure: "/sign-in?notice=confirm-failed",
  });
}
