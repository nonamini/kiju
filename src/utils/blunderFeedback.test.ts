import { describe, expect, it } from 'vitest';
import { Shogi } from 'shogi.js';
import type { MoveEvaluation } from '../types/shogi';
import { buildProgressiveHint, classifyBlunder } from './blunderFeedback';

const makeEval = (partial: Partial<MoveEvaluation>): MoveEvaluation => ({
  scoreCp: 0,
  depth: 8,
  evaluatedAt: '2026-11-28T00:00:00.000Z',
  ...partial,
});

describe('blunderFeedback (Issue #22)', () => {
  it('ignores minor eval fluctuations under threshold', () => {
    const shogi = new Shogi();
    const sfen = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 2';
    shogi.initializeFromSFENString(sfen);

    const result = classifyBlunder({
      shogi,
      sfen,
      ply: 1,
      moverColor: 0,
      prevEval: makeEval({ scoreCp: 100 }),
      curEval: makeEval({ scoreCp: -50, bestMove: '8c8d', pv: ['8c8d'] }),
    });

    expect(result).toBeNull();
  });

  it('detects free_capture refutation and formats 1-3 move PV', () => {
    const shogi = new Shogi();
    // Sente moved Gold to 5e undefended where Gote Silver at 4d can capture cleanly
    const sfen = '4k4/9/9/5s3/4G4/9/9/9/4K4 w - 2';
    shogi.initializeFromSFENString(sfen);

    const warning = classifyBlunder({
      shogi,
      sfen,
      ply: 2,
      moverColor: 0,
      prevEval: makeEval({ scoreCp: 200 }),
      curEval: makeEval({
        scoreCp: -600,
        bestMove: '4d5e',
        pv: ['4d5e', '5i4h'],
      }),
    });

    expect(warning).not.toBeNull();
    expect(warning?.reason).toBe('free_capture');
    expect(warning?.cpDrop).toBe(800);
    expect(warning?.refutationPvJapanese).toEqual(['△５五銀', '▲４八玉']);
  });

  it('detects mate_allowed when refutation forces mate against mover', () => {
    const shogi = new Shogi();
    const sfen = '4k4/9/9/9/9/9/9/9/4K4 w g 2';
    shogi.initializeFromSFENString(sfen);

    const warning = classifyBlunder({
      shogi,
      sfen,
      ply: 2,
      moverColor: 0,
      prevEval: makeEval({ scoreCp: 0 }),
      curEval: makeEval({
        scoreCp: -30000,
        isMate: true,
        matePly: 1,
        bestMove: 'G*5h',
        pv: ['G*5h'],
      }),
    });

    expect(warning).not.toBeNull();
    expect(warning?.reason).toBe('mate_allowed');
  });

  it('builds progressive hints across stages 1, 2, and 3 for board moves and drops', () => {
    const shogi = new Shogi();
    shogi.initializeFromSFENString(
      'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b P 1'
    );

    const s1 = buildProgressiveHint('7g7f', shogi, 1);
    expect(s1?.highlightSquares).toEqual([{ x: 7, y: 7 }]);
    expect(s1?.isDrop).toBe(false);
    expect(s1?.japaneseMove).toBeUndefined();

    const s2 = buildProgressiveHint('7g7f', shogi, 2);
    expect(s2?.highlightSquares).toEqual([
      { x: 7, y: 7 },
      { x: 7, y: 6 },
    ]);
    expect(s2?.japaneseMove).toBeUndefined();

    const s3 = buildProgressiveHint('7g7f', shogi, 3);
    expect(s3?.highlightSquares).toEqual([
      { x: 7, y: 7 },
      { x: 7, y: 6 },
    ]);
    expect(s3?.japaneseMove).toBe('▲７六歩');

    const dropS1 = buildProgressiveHint('P*5e', shogi, 1);
    expect(dropS1?.isDrop).toBe(true);
    expect(dropS1?.dropPieceKind).toBe('FU');
    expect(dropS1?.highlightSquares).toEqual([]);
  });
});
