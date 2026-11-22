export type PurgeCandidate = {
  path: string;
  /** The verification_documents row, or null for a file with no record. */
  document_id: string | null;
  reason: "retention" | "orphan";
};

/** Everything the purge needs from the outside, so it can be tested alone. */
export type PurgeDeps = {
  listCandidates(retentionDays: number, limit: number): Promise<PurgeCandidate[]>;
  /** Resolves with the paths that were really removed. Rejects if storage fails. */
  removeFiles(paths: string[]): Promise<{ removed: string[] }>;
  markPurged(documentIds: string[]): Promise<void>;
};

export type PurgeResult = {
  found: number;
  removed: number;
  marked: number;
  failed: number;
};

/**
 * Deletes evidence files that are past their retention period or belong to no
 * claim (for example, their account was deleted), and records the deletion.
 *
 * A document is marked purged only after its file is confirmed gone, so a
 * failure leaves the work for the next run instead of losing track of a file.
 */
export async function purgeEvidence(
  deps: PurgeDeps,
  { retentionDays, limit }: { retentionDays: number; limit: number },
): Promise<PurgeResult> {
  if (!Number.isInteger(retentionDays) || retentionDays < 1) {
    throw new Error("retention period must be a whole number of days, at least 1");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error("batch size must be a whole number from 1 to 1000");
  }

  const candidates = await deps.listCandidates(retentionDays, limit);
  if (candidates.length === 0) {
    return { found: 0, removed: 0, marked: 0, failed: 0 };
  }

  const paths = [...new Set(candidates.map((c) => c.path))];
  const { removed } = await deps.removeFiles(paths);
  const gone = new Set(removed);

  const documentIds = [
    ...new Set(
      candidates
        .filter((c) => c.document_id !== null && gone.has(c.path))
        .map((c) => c.document_id as string),
    ),
  ];
  if (documentIds.length > 0) {
    await deps.markPurged(documentIds);
  }

  return {
    found: candidates.length,
    removed: gone.size,
    marked: documentIds.length,
    failed: paths.length - gone.size,
  };
}
