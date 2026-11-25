import { describe, it, expect } from 'vitest';
import {
  STALE_CLAIM_MS,
  isStaleProcessingClaim,
} from '../../workers/analysis-runner/src/claimPolicy.js';

describe('cloud analysis worker stale claim recovery policy (#62)', () => {
  const nowMs = Date.parse('2026-11-16T10:00:00.000Z');

  it('uses a 15-minute threshold aligned with the 10-minute workflow timeout', () => {
    expect(STALE_CLAIM_MS).toBe(15 * 60 * 1000);
  });

  it('returns false for null, undefined, or non-processing records', () => {
    expect(isStaleProcessingClaim(null, nowMs)).toBe(false);
    expect(isStaleProcessingClaim(undefined, nowMs)).toBe(false);
    expect(
      isStaleProcessingClaim(
        { analysisStatus: 'queued', analysisClaimedAt: '2026-11-16T09:00:00.000Z' },
        nowMs
      )
    ).toBe(false);
    expect(
      isStaleProcessingClaim(
        { analysisStatus: 'completed', analysisClaimedAt: '2026-11-16T09:00:00.000Z' },
        nowMs
      )
    ).toBe(false);
  });

  it('returns false for active processing claims younger than STALE_CLAIM_MS', () => {
    const claimedAt = new Date(nowMs - STALE_CLAIM_MS + 1000).toISOString();
    expect(
      isStaleProcessingClaim(
        { analysisStatus: 'processing', analysisClaimedAt: claimedAt },
        nowMs
      )
    ).toBe(false);
  });

  it('returns true for processing claims at or past STALE_CLAIM_MS', () => {
    const exactThreshold = new Date(nowMs - STALE_CLAIM_MS).toISOString();
    const olderClaim = new Date(nowMs - STALE_CLAIM_MS - 60_000).toISOString();
    expect(
      isStaleProcessingClaim(
        { analysisStatus: 'processing', analysisClaimedAt: exactThreshold },
        nowMs
      )
    ).toBe(true);
    expect(
      isStaleProcessingClaim(
        { analysisStatus: 'processing', analysisClaimedAt: olderClaim },
        nowMs
      )
    ).toBe(true);
  });

  it('returns true when a processing record lacks a valid analysisClaimedAt timestamp', () => {
    expect(isStaleProcessingClaim({ analysisStatus: 'processing' }, nowMs)).toBe(true);
    expect(
      isStaleProcessingClaim({ analysisStatus: 'processing', analysisClaimedAt: 'invalid-date' }, nowMs)
    ).toBe(true);
  });
});
