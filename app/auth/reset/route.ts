import type { NextRequest } from "next/server";

import { handleEmailLink } from "@/lib/auth/email-link";

/** Landing point for the password-reset link Supabase emails. */
export function GET(request: NextRequest) {
  return handleEmailLink(request, {
    defaultNext: "/reset-password",
    onFailure: "/forgot-password?notice=expired",
  });
}
