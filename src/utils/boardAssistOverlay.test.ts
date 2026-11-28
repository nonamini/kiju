import { describe, expect, it } from 'vitest';
import { Shogi } from 'shogi.js';
import { computeBoardAssistMap } from './boardAssistOverlay';

describe('boardAssistOverlay (Issue #19)', () => {
  it('detects sliding lines with ray blocking, attack counts, defense strength/deficiency, hanging pieces, and safe squares per side', () => {
    const shogi = new Shogi();
    shogi.initializeFromSFENString(
      '4k4/9/9/1b7/4Rg3/3S5/9/9/4K4 b - 1'
    );

    const map = computeBoardAssistMap(shogi, 0);
    const at = (x: number, y: number) => map.find((s) => s.x === x && s.y === y)!;

    // 1. Sente Rook sliding ray goes right up to (4,5) and is blocked beyond it at (3,5)
    expect(at(4, 5).senteSliding).toBe(true);
    expect(at(3, 5).senteSliding).toBe(false);

    // 2. Gote Bishop sliding ray goes diagonally (8,4) -> (7,5) -> (6,6) and is blocked beyond (6,6)
    expect(at(7, 5).goteSliding).toBe(true);
    expect(at(6, 6).goteSliding).toBe(true);
    expect(at(5, 7).goteSliding).toBe(false);

    // 3. Hanging & weak defense per side
    expect(at(6, 6).senteHanging).toBe(true);
    expect(at(6, 6).senteWeakPiece).toBe(true);
    expect(at(6, 6).goteHanging).toBe(false);

    // 4. Free capture per side
    expect(at(4, 5).senteFreeCapture).toBe(true);
    expect(at(4, 5).goteWeakPiece).toBe(true);

    // 5. Attack counts:
    // - (5,6) is attacked by Sente Rook (1) and Gote Gold (1)
    // - (5,7) is attacked by both Sente Rook and Sente Silver (2 -> solid coverage)
    expect(at(5, 6).senteAttacks).toBe(1);
    expect(at(5, 6).goteAttacks).toBe(1);
    expect(at(5, 6).senteSafeEmpty).toBe(false);
    expect(at(5, 7).senteAttacks).toBe(2);

    // 6. Far empty square (1,9) has zero enemy attacks -> safe empty for Sente
    expect(at(1, 9).senteSafeEmpty).toBe(true);
  });
});
