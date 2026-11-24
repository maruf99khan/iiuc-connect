export type CvPurgeCandidate = {
  path: string;
  /** orphan: no application points at the file; withdrawn: the application was withdrawn. */
  reason: "orphan" | "withdrawn";
};

/** Everything the purge needs from the outside, so it can be tested alone. */
export type CvPurgeDeps = {
  listCandidates(limit: number): Promise<CvPurgeCandidate[]>;
  /** Resolves with the paths that were really removed. Rejects if storage fails. */
  removeFiles(paths: string[]): Promise<{ removed: string[] }>;
};

export type CvPurgeResult = { found: number; removed: number; failed: number };

/**
 * Deletes CV files that belong to no application or to a withdrawn one. Only
 * files storage confirms as gone are counted, and a storage failure is thrown,
 * so the next daily run finds the same files again.
 */
export async function purgeCvs(
  deps: CvPurgeDeps,
  { limit }: { limit: number },
): Promise<CvPurgeResult> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error("batch size must be a whole number from 1 to 1000");
  }

  const candidates = await deps.listCandidates(limit);
  if (candidates.length === 0) return { found: 0, removed: 0, failed: 0 };

  const paths = [...new Set(candidates.map((c) => c.path))];
  const { removed } = await deps.removeFiles(paths);
  const gone = new Set(removed);

  return {
    found: candidates.length,
    removed: gone.size,
    failed: paths.length - gone.size,
  };
}
