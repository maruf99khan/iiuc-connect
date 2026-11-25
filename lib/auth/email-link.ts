import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import { emailOtpTypeSchema, safeNextPath } from "@/lib/auth/schemas";
import { createClient } from "@/lib/supabase/server";

/**
 * Turns the one-time token in an emailed link into a session, then redirects.
 *
 * Two link shapes are accepted:
 *   ?token_hash=…&type=…  from an email template that links here directly.
 *                         Works on any device.
 *   ?code=…               from Supabase's default template. Works only in
 *                         the browser that asked for the email.
 *
 * `next` is honoured only as a path on this site. A link that does not sign
 * the visitor in goes to `onFailure`, and nothing from the URL is shown.
 */
export async function handleEmailLink(
  request: NextRequest,
  { defaultNext, onFailure }: { defaultNext: string; onFailure: string },
) {
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

  const next = params.get("next");
  const destination = signedIn
    ? next === null
      ? defaultNext
      : safeNextPath(next)
    : onFailure;

  return NextResponse.redirect(new URL(destination, request.nextUrl.origin));
}
