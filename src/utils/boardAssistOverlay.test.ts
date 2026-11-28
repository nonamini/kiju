import { describe, expect, it } from 'vitest';
import { Shogi } from 'shogi.js';
import { computeBoardAssistMap, resolveAssistViewerColor } from './boardAssistOverlay';

describe('boardAssistOverlay (Issue #19)', () => {
  it('computes perspective-aware sliding rays, tactical danger/free-capture alerts, and attack counts', () => {
    const shogi = new Shogi();
    shogi.initializeFromSFENString(
      '4k4/9/9/1b7/4Rg3/3S5/9/9/4K4 b - 1'
    );

    const senteView = computeBoardAssistMap(shogi, 0);
    const atSente = (x: number, y: number) => senteView.find((s) => s.x === x && s.y === y)!;

    // 1. Sente Rook sliding ray reaches (4,5) and is blocked beyond it at (3,5)
    expect(atSente(4, 5).ownSliding).toBe(true);
    expect(atSente(3, 5).ownSliding).toBe(false);

    // 2. Gote Bishop sliding ray goes diagonally (8,4) -> (7,5) -> (6,6) and stops at (6,6)
    expect(atSente(7, 5).enemySliding).toBe(true);
    expect(atSente(6, 6).enemySliding).toBe(true);
    expect(atSente(5, 7).enemySliding).toBe(false);

    // 3. Tactical danger: Sente Silver at (6,6) has enemyAttacks=1 > ownAttacks=0
    expect(atSente(6, 6).isDangerPiece).toBe(true);
    // Unthreatened Sente Rook at (5,5) is not flagged as dangerous
    expect(atSente(5, 5).isDangerPiece).toBe(false);

    // 4. Tactical free capture from Sente perspective: Gote Gold at (4,5) has ownAttacks=1, enemyAttacks=0
    expect(atSente(4, 5).isFreeCapture).toBe(true);

    // 5. Gote perspective flips own/enemy danger and capture targets cleanly
    const goteView = computeBoardAssistMap(shogi, 1);
    const atGote = (x: number, y: number) => goteView.find((s) => s.x === x && s.y === y)!;
    expect(atGote(4, 5).isDangerPiece).toBe(true);
    expect(atGote(6, 6).isFreeCapture).toBe(true);
    expect(atGote(6, 6).isDangerPiece).toBe(false);

    // 6. Attack counts remain accurate on every square
    expect(atSente(5, 6).senteAttacks).toBe(1);
    expect(atSente(5, 6).goteAttacks).toBe(1);
    expect(atSente(5, 7).senteAttacks).toBe(2);
  });

  it('resolves perspective according to study mode, AI match player side, PvP turn, and manual overrides', () => {
    // Explicit overrides always win
    expect(
      resolveAssistViewerColor('sente', {
        turn: 1,
        isMatchActive: true,
        matchSenteIsHuman: false,
        matchGoteIsHuman: true,
      })
    ).toBe(0);
    expect(
      resolveAssistViewerColor('gote', {
        turn: 0,
        isMatchActive: false,
        matchSenteIsHuman: true,
        matchGoteIsHuman: false,
      })
    ).toBe(1);

    // Turn mode follows board turn even during AI match
    expect(
      resolveAssistViewerColor('turn', {
        turn: 1,
        isMatchActive: true,
        matchSenteIsHuman: true,
        matchGoteIsHuman: false,
      })
    ).toBe(1);

    // Auto in AI match locks to the human player side regardless of whose turn it is
    expect(
      resolveAssistViewerColor('auto', {
        turn: 1,
        isMatchActive: true,
        matchSenteIsHuman: true,
        matchGoteIsHuman: false,
      })
    ).toBe(0);
    expect(
      resolveAssistViewerColor('auto', {
        turn: 0,
        isMatchActive: true,
        matchSenteIsHuman: false,
        matchGoteIsHuman: true,
      })
    ).toBe(1);

    // Auto in PvP match or Study follows board turn
    expect(
      resolveAssistViewerColor('auto', {
        turn: 1,
        isMatchActive: true,
        matchSenteIsHuman: true,
        matchGoteIsHuman: true,
      })
    ).toBe(1);
    expect(
      resolveAssistViewerColor('auto', {
        turn: 0,
        isMatchActive: false,
        matchSenteIsHuman: true,
        matchGoteIsHuman: false,
      })
    ).toBe(0);
  });
});
