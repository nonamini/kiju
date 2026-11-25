/**
 * Unit tests for Tsume-shogi Mate Checker utility.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import { describe, expect, it } from 'vitest';
import { checkTsumeMate } from './tsumeMateChecker';

describe('tsumeMateChecker', () => {
  it('detects classic 1-move head gold checkmate even without attacker king', async () => {
    const res = await checkTsumeMate('8k/9/7S1/9/9/9/9/9/9 b G 1', 1);
    expect(res.hasMate).toBe(true);
    expect(res.matePly).toBe(1);
    expect(res.solutionPv?.length).toBe(1);
  });

  it('detects 3-move checkmate when a 1-move mate does not exist', async () => {
    // 2a Knight, 1a King, 2b Pawn, 3c Dragon, 2c Silver, 1c Pawn, 2i Lance, Hand: G
    // 3-move mate: G*1b -> 2c1b -> 2i2b+ (or 3c2b)
    const res = await checkTsumeMate('7nk/7p1/6+RsP/9/9/9/9/9/7L1 b G 1', 3);
    expect(res.hasMate).toBe(true);
    expect(res.matePly).toBe(3);
    expect(res.solutionPv?.slice(0, 2)).toEqual(['G*1b', '2c1b']);
    expect(res.solutionPv?.length).toBe(3);
  });

  it('rejects positions where defending king starts already in check', async () => {
    const res = await checkTsumeMate('7pp/8k/7G1/9/9/9/9/9/9 b G 1', 1);
    expect(res.hasMate).toBe(false);
    expect(res.reasonKey).toBe('position_editor.mate_err_already_in_check');
  });

  it('rejects positions with no defending king', async () => {
    const res = await checkTsumeMate('9/9/9/9/9/9/9/9/9 b G 1', 3);
    expect(res.hasMate).toBe(false);
    expect(res.reasonKey).toBe('position_editor.mate_err_no_defender_king');
  });

  it('returns mate_not_found for unsolvable positions', async () => {
    const res = await checkTsumeMate('4k4/9/9/9/9/9/9/9/9 b P 1', 3);
    expect(res.hasMate).toBe(false);
    expect(res.reasonKey).toBe('position_editor.mate_not_found');
  });
});
