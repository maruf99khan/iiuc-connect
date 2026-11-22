import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { publicEnv } from "@/lib/env";
import { isAuthorizedCron, parseCronEnv } from "@/lib/evidence/cron";
import { purgeEvidence, type PurgeCandidate } from "@/lib/evidence/purge";
import type { Database } from "@/types/database.types";

const BUCKET = "verification-documents";
const BATCH_SIZE = 100;

/**
 * Deletes evidence files that are past retention or belong to no claim.
 * Meant to be called by a scheduler (for example a daily Vercel Cron) with
 * `Authorization: Bearer $CRON_SECRET`. This is the only place that uses the
 * privileged Supabase key; every other request uses the member's own session.
 */
export async function GET(request: NextRequest) {
  const env = parseCronEnv(process.env);
  if (!env.ok) {
    console.error("evidence purge is not configured; check:", env.missing.join(", "));
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  if (!isAuthorizedCron(request.headers.get("authorization"), env.data.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    env.data.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    const result = await purgeEvidence(
      {
        async listCandidates(retentionDays, limit) {
          const { data, error } = await supabase.rpc("evidence_purge_candidates", {
            p_retention_days: retentionDays,
            p_limit: limit,
          });
          if (error) throw new Error(`could not list candidates: ${error.message}`);
          return data as PurgeCandidate[];
        },
        async removeFiles(paths) {
          const { data, error } = await supabase.storage.from(BUCKET).remove(paths);
          if (error) throw new Error(`could not remove files: ${error.message}`);
          // Only files the API confirms are treated as gone.
          return { removed: (data ?? []).map((file) => file.name) };
        },
        async markPurged(documentIds) {
          const { error } = await supabase.rpc("mark_evidence_purged", {
            p_document_ids: documentIds,
          });
          if (error) throw new Error(`could not record purge: ${error.message}`);
        },
      },
      { retentionDays: env.data.retentionDays, limit: BATCH_SIZE },
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("evidence purge failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Purge failed." }, { status: 500 });
  }
}
