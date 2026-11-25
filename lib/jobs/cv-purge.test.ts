import { describe, expect, it, vi } from "vitest";

import { purgeCvs, type CvPurgeDeps } from "./cv-purge";

const orphan = { path: "u1/a1.pdf", reason: "orphan" as const };
const withdrawn = { path: "u2/a2.pdf", reason: "withdrawn" as const };

function deps(overrides: Partial<CvPurgeDeps> = {}): CvPurgeDeps {
  return {
    listCandidates: vi.fn(async () => [orphan, withdrawn]),
    removeFiles: vi.fn(async (paths: string[]) => ({ removed: paths })),
    ...overrides,
  };
}

describe("purgeCvs", () => {
  it("does nothing, and does not call storage, when there are no candidates", async () => {
    const d = deps({ listCandidates: vi.fn(async () => []) });
    await expect(purgeCvs(d, { limit: 100 })).resolves.toEqual({
      found: 0,
      removed: 0,
      failed: 0,
    });
    expect(d.removeFiles).not.toHaveBeenCalled();
  });

  it("removes every listed file and counts them", async () => {
    const d = deps();
    await expect(purgeCvs(d, { limit: 100 })).resolves.toEqual({
      found: 2,
      removed: 2,
      failed: 0,
    });
    expect(d.removeFiles).toHaveBeenCalledWith(["u1/a1.pdf", "u2/a2.pdf"]);
  });

  it("asks storage once for a path that is listed twice", async () => {
    const d = deps({ listCandidates: vi.fn(async () => [orphan, orphan]) });
    await purgeCvs(d, { limit: 100 });
    expect(d.removeFiles).toHaveBeenCalledWith(["u1/a1.pdf"]);
  });

  it("counts only the files storage confirms as removed", async () => {
    const d = deps({ removeFiles: vi.fn(async () => ({ removed: ["u1/a1.pdf"] })) });
    await expect(purgeCvs(d, { limit: 100 })).resolves.toEqual({
      found: 2,
      removed: 1,
      failed: 1,
    });
  });

  it("lets a storage failure reach the caller, so the next run tries again", async () => {
    const d = deps({
      removeFiles: vi.fn(async () => {
        throw new Error("storage is down");
      }),
    });
    await expect(purgeCvs(d, { limit: 100 })).rejects.toThrow("storage is down");
  });

  it("passes the batch size to the listing", async () => {
    const d = deps();
    await purgeCvs(d, { limit: 25 });
    expect(d.listCandidates).toHaveBeenCalledWith(25);
  });

  it.each([0, -1, 1001, 1.5, Number.NaN])("refuses a batch size of %s", async (limit) => {
    const d = deps();
    await expect(purgeCvs(d, { limit })).rejects.toThrow();
    expect(d.listCandidates).not.toHaveBeenCalled();
  });
});
