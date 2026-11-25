/**
 * Pure claim-recovery policy shared by the cloud analysis worker and tests (#62).
 */

export const STALE_CLAIM_MS = 15 * 60 * 1000;

/**
 * Returns true when a record is stuck in 'processing' past STALE_CLAIM_MS
 * (e.g., previous runner hit workflow timeout before writing final state).
 */
export function isStaleProcessingClaim(data, nowMs = Date.now()) {
  if (!data || data.analysisStatus !== 'processing') return false;
  const claimedMs = Date.parse(String(data.analysisClaimedAt ?? ''));
  if (Number.isNaN(claimedMs)) return true;
  return nowMs - claimedMs >= STALE_CLAIM_MS;
}
