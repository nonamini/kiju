import { describe, expect, it } from 'vitest';
import { Shogi } from 'shogi.js';
import { buildFlippedTurnSfen } from './opponentThreat';

describe('opponentThreat (Issue #21)', () => {
  it('flips turn token from Sente to Gote and vice versa in legal non-check positions', () => {
    const shogi = new Shogi();
    const senteSfen = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1';
    shogi.initializeFromSFENString(senteSfen);

    expect(buildFlippedTurnSfen(shogi, senteSfen)).toBe(
      'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1'
    );

    const goteSfen = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 2';
    shogi.initializeFromSFENString(goteSfen);

    expect(buildFlippedTurnSfen(shogi, goteSfen)).toBe(
      'lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL b - 2'
    );
  });

  it('returns null when the side to move is currently in check', () => {
    const shogi = new Shogi();
    // Sente King at 5i directly checked by Gote Rook at 5h
    const checkSfen = '4k4/9/9/9/9/9/9/4r4/4K4 b - 1';
    shogi.initializeFromSFENString(checkSfen);

    expect(buildFlippedTurnSfen(shogi, checkSfen)).toBeNull();
  });
});
