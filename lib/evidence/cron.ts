import { timingSafeEqual } from "node:crypto";

import { z } from "zod";

const envSchema = z.object({
  // The privileged key. Never NEXT_PUBLIC_, never sent to the browser.
  SUPABASE_SECRET_KEY: z.string().min(20),
  // Shared with the scheduler. Long enough that it cannot be guessed.
  CRON_SECRET: z.string().min(24),
  EVIDENCE_RETENTION_DAYS: z
    .string()
    .regex(/^[1-9]\d{0,3}$/)
    .refine((days) => Number(days) <= 3650)
    .optional(),
});

export type CronEnv = {
  SUPABASE_SECRET_KEY: string;
  CRON_SECRET: string;
  retentionDays: number;
};

/**
 * Reads the evidence-purge configuration. A missing or malformed setting means
 * the job is not configured, and the result names the setting, never its value.
 */
export function parseCronEnv(
  source: Record<string, string | undefined>,
): { ok: true; data: CronEnv } | { ok: false; missing: string[] } {
  // An empty value in a .env file is the same as no value.
  const clean = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== ""),
  );
  const parsed = envSchema.safeParse({
    SUPABASE_SECRET_KEY: clean.SUPABASE_SECRET_KEY,
    CRON_SECRET: clean.CRON_SECRET,
    EVIDENCE_RETENTION_DAYS: clean.EVIDENCE_RETENTION_DAYS,
  });

  if (!parsed.success) {
    return {
      ok: false,
      missing: [
        ...new Set(parsed.error.issues.map((issue) => String(issue.path[0]))),
      ],
    };
  }

  return {
    ok: true,
    data: {
      SUPABASE_SECRET_KEY: parsed.data.SUPABASE_SECRET_KEY,
      CRON_SECRET: parsed.data.CRON_SECRET,
      retentionDays: Number(parsed.data.EVIDENCE_RETENTION_DAYS ?? "30"),
    },
  };
}

/** True only for exactly `Bearer <secret>`, compared in constant time. */
export function isAuthorizedCron(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
