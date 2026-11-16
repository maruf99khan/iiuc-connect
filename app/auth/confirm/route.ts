import { NextResponse, type NextRequest } from "next/server";

import { emailOtpTypeSchema, safeNextPath } from "@/lib/auth/schemas";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for the links Supabase emails (confirm sign-up, and later
 * password recovery). Turns the one-time token in the link into a session.
 *
 * Two link shapes are accepted:
 *   ?token_hash=…&type=…  from an email template that links here directly.
 *                         Works on any device.
 *   ?code=…               from Supabase's default template. Works only in
 *                         the browser that started the sign-up.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = emailOtpTypeSchema.safeParse(params.get("type"));
  const code = params.get("code");

  const supabase = await createClient();
  let signedIn = false;

  if (tokenHash && type.success) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type.data,
    });
    signedIn = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    signedIn = !error;
  }

  const destination = signedIn
    ? safeNextPath(params.get("next"))
    : "/sign-in?notice=confirm-failed";

  return NextResponse.redirect(new URL(destination, request.nextUrl.origin));
}
