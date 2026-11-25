import { describe, expect, it, vi } from "vitest";

import { purgeEvidence, type PurgeDeps } from "@/lib/evidence/purge";

function deps(overrides: Partial<PurgeDeps> = {}): PurgeDeps {
  return {
    listCandidates: vi.fn().mockResolvedValue([]),
    removeFiles: vi.fn().mockResolvedValue({ removed: [] }),
    markPurged: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const retention = { path: "u1/r1/a.jpg", document_id: "d1", reason: "retention" as const };
const retention2 = { path: "u1/r1/b.jpg", document_id: "d2", reason: "retention" as const };
const orphan = { path: "gone/r9/c.jpg", document_id: null, reason: "orphan" as const };

describe("purgeEvidence", () => {
  it("does nothing when there is nothing to purge", async () => {
    const d = deps();
    const result = await purgeEvidence(d, { retentionDays: 30, limit: 100 });
    expect(result).toEqual({ found: 0, removed: 0, marked: 0, failed: 0 });
    expect(d.removeFiles).not.toHaveBeenCalled();
    expect(d.markPurged).not.toHaveBeenCalled();
  });

  it("passes the retention period and batch size to the lookup", async () => {
    const d = deps();
    await purgeEvidence(d, { retentionDays: 45, limit: 20 });
    expect(d.listCandidates).toHaveBeenCalledWith(45, 20);
  });

  it("removes the files, then marks the documents that had a record", async () => {
    const d = deps({
      listCandidates: vi.fn().mockResolvedValue([retention, orphan, retention2]),
      removeFiles: vi.fn().mockResolvedValue({
        removed: [retention.path, orphan.path, retention2.path],
      }),
    });
    const result = await purgeEvidence(d, { retentionDays: 30, limit: 100 });

    expect(d.removeFiles).toHaveBeenCalledWith([retention.path, orphan.path, retention2.path]);
    expect(d.markPurged).toHaveBeenCalledWith(["d1", "d2"]);
    expect(result).toEqual({ found: 3, removed: 3, marked: 2, failed: 0 });
  });

  it("marks only the documents whose file was actually removed", async () => {
    const d = deps({
      listCandidates: vi.fn().mockResolvedValue([retention, retention2]),
      removeFiles: vi.fn().mockResolvedValue({ removed: [retention.path] }),
    });
    const result = await purgeEvidence(d, { retentionDays: 30, limit: 100 });

    expect(d.markPurged).toHaveBeenCalledWith(["d1"]);
    expect(result).toEqual({ found: 2, removed: 1, marked: 1, failed: 1 });
  });

  it("does not mark anything when no file could be removed", async () => {
    const d = deps({
      listCandidates: vi.fn().mockResolvedValue([retention]),
      removeFiles: vi.fn().mockResolvedValue({ removed: [] }),
    });
    const result = await purgeEvidence(d, { retentionDays: 30, limit: 100 });

    expect(d.markPurged).not.toHaveBeenCalled();
    expect(result).toEqual({ found: 1, removed: 0, marked: 0, failed: 1 });
  });

  it("asks for each file once, even if it is listed twice", async () => {
    const d = deps({
      listCandidates: vi.fn().mockResolvedValue([retention, retention]),
      removeFiles: vi.fn().mockResolvedValue({ removed: [retention.path] }),
    });
    await purgeEvidence(d, { retentionDays: 30, limit: 100 });
    expect(d.removeFiles).toHaveBeenCalledWith([retention.path]);
  });

  it("lets a storage failure surface instead of marking documents purged", async () => {
    const d = deps({
      listCandidates: vi.fn().mockResolvedValue([retention]),
      removeFiles: vi.fn().mockRejectedValue(new Error("storage down")),
    });
    await expect(
      purgeEvidence(d, { retentionDays: 30, limit: 100 }),
    ).rejects.toThrow("storage down");
    expect(d.markPurged).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, Number.NaN])("refuses the retention period %s", async (retentionDays) => {
    await expect(
      purgeEvidence(deps(), { retentionDays, limit: 10 }),
    ).rejects.toThrow(/retention/i);
  });

  it.each([0, -5, 1001, 2.5])("refuses the batch size %s", async (limit) => {
    await expect(
      purgeEvidence(deps(), { retentionDays: 30, limit }),
    ).rejects.toThrow(/batch/i);
  });
});
