import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "application-cvs";
/** The link is made when the person clicks, so it only has to outlast the redirect. */
const SIGNED_URL_SECONDS = 60;

const ids = z.object({ id: z.uuid(), applicationId: z.uuid() });

function notFound() {
  return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

/**
 * Sends the signed-in applicant or the job's poster to a short-lived link to the
 * application's CV. Two database rules decide who gets one: the application row
 * must be readable (the applicant, the poster, or an admin) and then the storage
 * policy must allow the file (the applicant, or the poster while the application
 * is not withdrawn). An admin can read the row but not the file, so gets a 404.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/jobs/[id]/cv/[applicationId]">,
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/sign-in", request.url));

  const parsed = ids.safeParse(await ctx.params);
  if (!parsed.success) return notFound();

  const supabase = await createClient();
  const { data: application } = await supabase
    .from("job_applications")
    .select("cv_path")
    .eq("id", parsed.data.applicationId)
    .eq("job_id", parsed.data.id)
    .maybeSingle();
  if (!application?.cv_path) return notFound();

  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(application.cv_path, SIGNED_URL_SECONDS);
  if (!signed) return notFound();

  const response = NextResponse.redirect(signed.signedUrl);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
