/**
 * Duplicate kifu detection via normalized content hash (Issue #44).
 * Compares the candidate's canonical move-sequence hash against every
 * stored KifuRecord.contentHash. Headers, comments, player names and
 * dates do not affect the hash, so the same game imported from different
 * sources is still detected.
 * Follows Rule 1: strictly English code, comments, identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import { KifuRecord } from '../types/kifuRecord';
import { computeKifuRecordContentHash } from './kifuContentHash';
import { loadKifuRecords, updateKifuRecord } from './kifuRecordStorage';

export interface KifuDuplicateQuery {
  jkfJson?: string;
  rawKif?: string;
  /** Record ids to exclude from matching (e.g. the record being overwritten). */
  excludeIds?: string[];
}

/**
 * Returns all KifuRecords whose contentHash matches the candidate's.
 * Returns an empty array when the candidate cannot be hashed.
 */
export function findDuplicateKifuRecords(query: KifuDuplicateQuery): KifuRecord[] {
  const hash = computeKifuRecordContentHash(query);
  if (!hash) return [];
  const exclude = new Set(query.excludeIds ?? []);
  return loadKifuRecords().filter(
    (r) => r.contentHash === hash && !exclude.has(r.id)
  );
}

/**
 * Merge semantics for duplicate resolution: keeps the existing record and
 * unions the candidate's tags into it. Returns the updated record, or null
 * when there is nothing to merge.
 */
export function mergeTagsIntoExistingRecord(
  existing: KifuRecord,
  candidateTags: string[] | undefined
): KifuRecord | null {
  if (!candidateTags || candidateTags.length === 0) return null;
  const merged = Array.from(new Set([...(existing.tags ?? []), ...candidateTags]));
  if (merged.length === (existing.tags ?? []).length) return null;
  return updateKifuRecord(existing.id, { tags: merged });
}
