export const STALE_CLAIM_MS: number;

export function isStaleProcessingClaim(
  data: { analysisStatus?: string; analysisClaimedAt?: string } | null | undefined,
  nowMs?: number
): boolean;
