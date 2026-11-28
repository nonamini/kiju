import { describe, expect, it } from 'vitest';
import { Shogi } from 'shogi.js';
import { computeMaterialAndImpasse } from './materialBalance';

describe('materialBalance (Issue #20)', () => {
  it('returns zero material diff and balanced 27-point base in starting position', () => {
    const shogi = new Shogi();
    shogi.initializeFromSFENString(
      'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1'
    );

    const summary = computeMaterialAndImpasse(shogi);
    expect(summary.diff).toBe(0);
    expect(summary.senteScore).toBe(summary.goteScore);
    expect(summary.pieceDiffs).toEqual([]);
    expect(summary.senteDeclaration.kingEntered).toBe(false);
    expect(summary.senteDeclaration.canDeclareWin).toBe(false);
    expect(summary.goteDeclaration.canDeclareWin).toBe(false);
  });

  it('computes net material exchange difference accurately (e.g. Bishop vs Silver + Knight)', () => {
    const shogi = new Shogi();
    // Sente has a Bishop (8) vs Gote Silver (5) + Knight (4) = -1 diff for Sente
    shogi.initializeFromSFENString('4k4/9/9/9/9/9/9/9/4K4 b Bsn 1');

    const summary = computeMaterialAndImpasse(shogi);
    expect(summary.senteScore).toBe(8);
    expect(summary.goteScore).toBe(9);
    expect(summary.diff).toBe(-1);
    expect(summary.pieceDiffs).toEqual([
      { baseKind: 'KA', diff: 1 },
      { baseKind: 'GI', diff: -1 },
      { baseKind: 'KE', diff: -1 },
    ]);
  });

  it('evaluates JSA 27-point declaration law conditions for Sente (threshold 28)', () => {
    const shogi = new Shogi();
    // Sente King at 5a (enemy camp) with 10 pawns in enemy camp + 18 points in hand (2 Rooks + 8 Pawns = 18 + 10 = 28 pts)
    shogi.initializeFromSFENString(
      '4K4/PPPPPPPPP/P8/9/9/9/9/9/4k4 b 2R8P 1'
    );

    const summary = computeMaterialAndImpasse(shogi);
    expect(summary.senteDeclaration.kingEntered).toBe(true);
    expect(summary.senteDeclaration.enemyTerritoryPieceCount).toBe(10);
    expect(summary.senteDeclaration.piecesOk).toBe(true);
    expect(summary.senteDeclaration.notInCheck).toBe(true);
    expect(summary.senteDeclaration.totalPoints).toBe(28);
    expect(summary.senteDeclaration.pointsOk).toBe(true);
    expect(summary.senteDeclaration.canDeclareWin).toBe(true);

    // Gote is far below threshold
    expect(summary.goteDeclaration.canDeclareWin).toBe(false);
  });
});
