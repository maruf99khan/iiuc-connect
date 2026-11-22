import { describe, expect, it } from "vitest";

import { isAuthorizedCron, parseCronEnv } from "@/lib/evidence/cron";

const secret = "s".repeat(32);
const key = "sb_secret_" + "k".repeat(20);

describe("parseCronEnv", () => {
  it("accepts both secrets and defaults the retention to 30 days", () => {
    const result = parseCronEnv({ SUPABASE_SECRET_KEY: key, CRON_SECRET: secret });
    expect(result).toEqual({
      ok: true,
      data: { SUPABASE_SECRET_KEY: key, CRON_SECRET: secret, retentionDays: 30 },
    });
  });

  it("reads a custom retention period", () => {
    const result = parseCronEnv({
      SUPABASE_SECRET_KEY: key,
      CRON_SECRET: secret,
      EVIDENCE_RETENTION_DAYS: "90",
    });
    expect(result.ok && result.data.retentionDays).toBe(90);
  });

  it.each(["0", "-3", "1.5", "abc", "4000"])("rejects a retention of %s", (days) => {
    const result = parseCronEnv({
      SUPABASE_SECRET_KEY: key,
      CRON_SECRET: secret,
      EVIDENCE_RETENTION_DAYS: days,
    });
    expect(result.ok).toBe(false);
  });

  it("is not configured when a secret is missing, and says which, never the value", () => {
    const result = parseCronEnv({ CRON_SECRET: secret });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toEqual(["SUPABASE_SECRET_KEY"]);
  });

  it("refuses a short cron secret, so a guessable one cannot be used", () => {
    const result = parseCronEnv({ SUPABASE_SECRET_KEY: key, CRON_SECRET: "short" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(JSON.stringify(result)).not.toContain("short");
  });

  it("treats empty strings as missing", () => {
    expect(parseCronEnv({ SUPABASE_SECRET_KEY: "", CRON_SECRET: "" }).ok).toBe(false);
  });
});

describe("isAuthorizedCron", () => {
  it("accepts the right bearer token", () => {
    expect(isAuthorizedCron(`Bearer ${secret}`, secret)).toBe(true);
  });

  it.each([
    ["no header", null],
    ["an empty header", ""],
    ["the secret without Bearer", secret],
    ["a different token", `Bearer ${"x".repeat(32)}`],
    ["a longer token", `Bearer ${secret}extra`],
    ["a shorter token", `Bearer ${secret.slice(0, -1)}`],
    ["a lower-case scheme", `bearer ${secret}`],
    ["two spaces", `Bearer  ${secret}`],
  ])("refuses %s", (_label, header) => {
    expect(isAuthorizedCron(header, secret)).toBe(false);
  });
});
