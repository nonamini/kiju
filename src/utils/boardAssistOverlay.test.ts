import { describe, expect, it } from 'vitest';
import { Shogi } from 'shogi.js';
import { computeBoardAssistMap } from './boardAssistOverlay';

describe('boardAssistOverlay (Issue #19)', () => {
  it('detects sliding lines with ray blocking, attack counts, hanging pieces, free captures, and safe squares', () => {
    const shogi = new Shogi();
    // Sente 28HI attacks up file 2 (blocked by 27FU), 88KA attacks 77,66,55,44,33,22 (Gote),
    // wait let's construct a focused custom position:
    // - Sente Rook at 5e (x=5, y=5), Gote Bishop at 2b (x=2, y=2)
    // - Sente Silver (hanging) at 5b (x=5, y=2): attacked by Gote Bishop at 2b? No, 2b is diagonal to 5e, orthogonal to 5b!
    //   Wait: Rook at 5e attacks 5b orthogonally (defends it), so let's put Sente Pawn at 8h?
    // Clean setup:
    // - Sente Rook at 5e (5,5)
    // - Gote Bishop at 3c (3,3) -> undefended by Gote, attacked diagonally by nothing? No, Rook at 5e defends 5c/3e, not 3c.
    // Let's put:
    //   Sente King 5i (5,9), Gote King 5a (5,1)
    //   Sente Rook 5e (5,5) -> attacks file 5 (5d, 5c, 5b, 5a(blocked); 5f, 5g, 5h, 5i(blocked)) and rank 5
    //   Gote Gold 4e (4,5) -> undefended by Gote, attacked by Sente Rook at 5e -> isFreeCapture! (Also blocks Rook ray to 3e, 2e, 1e!)
    //   Sente Knight 7g (7,7) -> wait: Gold 4e attacks 5e, 5d, 4d, 3d, 3e, 4f.
    //   Gote Bishop 8d (8,4) -> attacks 7e, 6f, 5g? Wait: let's put Sente Silver 6f (6,6) undefended by Sente, attacked by Gote Bishop 8d -> isHangingPiece!
    shogi.initializeFromSFENString(
      '4k4/9/9/1b7/4R1g2/3S5/9/9/4K4 b - 1'
    );
    // Check pieces in that SFEN:
    // Rank 1 (y=1): 4k4 -> Gote OU at (5,1)
    // Rank 4 (y=4): 1b7 -> Gote KA at (8,4)
    // Rank 5 (y=5): 4R1g2 -> Sente HI at (5,5), Gote KI at (3,5)? Wait: '4R1g2' = files 9,8,7,6 (4), file 5 = R (5,5), file 4 (1), file 3 = g (3,5)! Let's use '4Rg3' so Gote Gold is at (4,5) adjacent to Rook!
    shogi.initializeFromSFENString(
      '4k4/9/9/1b7/4Rg3/3S5/9/9/4K4 b - 1'
    );
    // Rank 6 (y=6): '3S5' = files 9,8,7 (3), file 6 = S (6,6)!
    // Gote KA at (8,4) attacks (7,5) -> (6,6)[Sente Silver] -> blocked! Does NOT reach (5,7).
    // Does anything defend Sente Silver at (6,6)?
    // Sente Rook is at (5,5) (orthogonal), King at (5,9) -> neither defends (6,6)!
    // Wait: Gote Gold at (4,5) moves down/sideways -> attacks (5,5), (5,6), (4,6), (3,6), (3,5), (4,4). So Sente Rook at (5,5) is attacked by Gote Gold at (4,5) AND nothing defends Sente Rook except King doesn't reach!
    const map = computeBoardAssistMap(shogi, 0);
    const at = (x: number, y: number) => map.find((s) => s.x === x && s.y === y)!;

    // 1. Sente Rook sliding ray goes right up to (4,5) and is blocked beyond it at (3,5)
    expect(at(4, 5).senteSliding).toBe(true);
    expect(at(3, 5).senteSliding).toBe(false);

    // 2. Gote Bishop sliding ray goes diagonally (8,4) -> (7,5) -> (6,6) and is blocked beyond (6,6)
    expect(at(7, 5).goteSliding).toBe(true);
    expect(at(6, 6).goteSliding).toBe(true);
    expect(at(5, 7).goteSliding).toBe(false);

    // 3. Hanging Sente Silver at (6,6): attacked by Gote Bishop (1), defended by Sente (0)
    expect(at(6, 6).isHangingPiece).toBe(true);

    // 4. Free capture Gote Gold at (4,5): attacked by Sente Rook (1), defended by Gote (0)
    expect(at(4, 5).isFreeCapture).toBe(true);

    // 5. Attack counts:
    // - (5,6) is attacked by Sente Rook (1) and Gote Gold (1) — Silver does not move sideways
    // - (5,7) is attacked by both Sente Rook and Sente Silver (2)
    expect(at(5, 6).senteAttacks).toBe(1);
    expect(at(5, 6).goteAttacks).toBe(1);
    expect(at(5, 6).isSafeEmpty).toBe(false);
    expect(at(5, 7).senteAttacks).toBe(2);

    // 6. Far empty square (1,9) has zero enemy attacks -> safe empty
    expect(at(1, 9).isSafeEmpty).toBe(true);
  });
});
