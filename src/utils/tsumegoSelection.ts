/**
 * Pure Tsumego filtering and next-problem selection helpers (Issue #162).
 * Supports fixed ply filters (1, 3, 5, 7, 9, 11, 13+), sequential ordering,
 * and non-repeating random selection.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import type { TsumegoProblem } from '../types/tsumego';

export type TsumegoPlyFilter = 'all' | 1 | 3 | 5 | 7 | 9 | 11 | '13+';

export const TSUMEGO_PLY_FILTER_OPTIONS: readonly TsumegoPlyFilter[] = [
  'all',
  1,
  3,
  5,
  7,
  9,
  11,
  '13+',
];

/**
 * Filters tsumego problems by the selected ply bucket.
 */
export function filterTsumegoByPly(
  problems: TsumegoProblem[],
  filter: TsumegoPlyFilter
): TsumegoProblem[] {
  if (filter === 'all') return problems;
  if (filter === '13+') {
    return problems.filter((p) => p.moveLimit >= 13);
  }
  return problems.filter((p) => p.moveLimit === filter);
}

/**
 * Picks the next problem from a filtered list either randomly (avoiding immediate repeat
 * when more than one problem exists) or sequentially with wrap-around.
 */
export function pickNextTsumegoProblem(
  filtered: TsumegoProblem[],
  currentId: string | null,
  isRandom: boolean,
  rng?: () => number
): TsumegoProblem | null {
  if (filtered.length === 0) return null;

  if (isRandom) {
    const candidates =
      filtered.length > 1 && currentId
        ? filtered.filter((p) => p.id !== currentId)
        : filtered;
    const pool = candidates.length > 0 ? candidates : filtered;
    const randomFn = rng ?? Math.random;
    const idx = Math.min(
      pool.length - 1,
      Math.max(0, Math.floor(randomFn() * pool.length))
    );
    return pool[idx] ?? null;
  }

  if (!currentId) {
    return filtered[0] ?? null;
  }
  const idx = filtered.findIndex((p) => p.id === currentId);
  if (idx < 0) {
    return filtered[0] ?? null;
  }
  return filtered[(idx + 1) % filtered.length] ?? null;
}
