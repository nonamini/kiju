/**
 * Unit Tests for Shogi Board State & UI Logic.
 * Verifies board setup, piece movements, captures, promotions, and hand counting.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import { describe, it, expect } from 'vitest';
import { ShogiBoard } from '../src/utils/shogiBoard';
import { ShogiMove } from '../src/types/shogi';

describe('ShogiBoard State & Logic', () => {
  it('initializes standard Hirate position correctly', () => {
    const board = new ShogiBoard();

    // Check corners
    expect(board.getSquare(1, 1)).toBe('l');
    expect(board.getSquare(9, 1)).toBe('l');
    expect(board.getSquare(5, 1)).toBe('k'); // Gote King

    expect(board.getSquare(1, 9)).toBe('L');
    expect(board.getSquare(9, 9)).toBe('L');
    expect(board.getSquare(5, 9)).toBe('K'); // Sente King

    // Check Rooks and Bishops
    expect(board.getSquare(8, 2)).toBe('r');
    expect(board.getSquare(2, 2)).toBe('b');
    expect(board.getSquare(2, 8)).toBe('R');
    expect(board.getSquare(8, 8)).toBe('B');

    // Turn & Ply
    expect(board.getTurn()).toBe('b');
    expect(board.getPly()).toBe(1);

    // Initial hands are empty
    const senteHand = board.getHand('b');
    const goteHand = board.getHand('w');
    for (const piece of ['R', 'B', 'G', 'S', 'N', 'L', 'P']) {
      expect(senteHand[piece]).toBe(0);
      expect(goteHand[piece]).toBe(0);
    }
  });

  it('correctly applies a quiet pawn push', () => {
    const board = new ShogiBoard();
    const move: ShogiMove = {
      ply: 1,
      color: 'b',
      from: { file: 7, rank: 7 },
      to: { file: 7, rank: 6 },
      piece: 'FU',
      isDrop: false,
      kifString: '７六歩(77)',
      sfenMove: '7g7f',
    };

    board.applyMove(move);

    expect(board.getSquare(7, 7)).toBeNull();
    expect(board.getSquare(7, 6)).toBe('P');
    expect(board.getTurn()).toBe('w');
    expect(board.getPly()).toBe(2);
  });

  it('correctly handles captures and adds unpromoted piece to hand', () => {
    const board = new ShogiBoard();

    // Move 1: 7g7f
    board.applyMove({
      ply: 1,
      color: 'b',
      from: { file: 7, rank: 7 },
      to: { file: 7, rank: 6 },
      piece: 'FU',
      isDrop: false,
      kifString: '７六歩(77)',
      sfenMove: '7g7f',
    });

    // Move 2: 3c3d
    board.applyMove({
      ply: 2,
      color: 'w',
      from: { file: 3, rank: 3 },
      to: { file: 3, rank: 4 },
      piece: 'FU',
      isDrop: false,
      kifString: '３四歩(33)',
      sfenMove: '3c3d',
    });

    // Move 3: 8h2b+ (Bishop captures Bishop and promotes to Horse)
    board.applyMove({
      ply: 3,
      color: 'b',
      from: { file: 8, rank: 8 },
      to: { file: 2, rank: 2 },
      piece: 'KA',
      promote: true,
      isDrop: false,
      kifString: '２二角成(88)',
      sfenMove: '8h2b+',
    });

    // Square 2,2 now has promoted bishop (+B)
    expect(board.getSquare(2, 2)).toBe('+B');
    // Square 8,8 is now vacant
    expect(board.getSquare(8, 8)).toBeNull();

    // Sente captured Gote bishop -> Sente hand now has 1 'B'
    const senteHand = board.getHand('b');
    expect(senteHand.B).toBe(1);
  });

  it('correctly handles piece drops from hand', () => {
    const board = new ShogiBoard();

    // Setup: simulate Sente having a captured Bishop
    board.applyMove({
      ply: 1,
      color: 'b',
      from: { file: 7, rank: 7 },
      to: { file: 7, rank: 6 },
      piece: 'FU',
      isDrop: false,
      kifString: '７六歩(77)',
      sfenMove: '7g7f',
    });
    board.applyMove({
      ply: 2,
      color: 'w',
      from: { file: 3, rank: 3 },
      to: { file: 3, rank: 4 },
      piece: 'FU',
      isDrop: false,
      kifString: '３四歩(33)',
      sfenMove: '3c3d',
    });
    board.applyMove({
      ply: 3,
      color: 'b',
      from: { file: 8, rank: 8 },
      to: { file: 2, rank: 2 },
      piece: 'KA',
      promote: false,
      isDrop: false,
      kifString: '２二角(88)',
      sfenMove: '8h2b',
    });
    // Gote captures back with Silver: 3a2b
    board.applyMove({
      ply: 4,
      color: 'w',
      from: { file: 3, rank: 1 },
      to: { file: 2, rank: 2 },
      piece: 'GI',
      promote: false,
      isDrop: false,
      kifString: '２二同銀(31)',
      sfenMove: '3a2b',
    });

    // Both Sente and Gote now have 1 Bishop in hand
    expect(board.getHand('b').B).toBe(1);
    expect(board.getHand('w').B).toBe(1);

    // Move 5: Sente drops Bishop on 4e (4, 5)
    board.applyMove({
      ply: 5,
      color: 'b',
      to: { file: 4, rank: 5 },
      piece: 'KA',
      isDrop: true,
      kifString: '４五角打',
      sfenMove: 'B*4e',
    });

    // Square 4,5 should now have 'B'
    expect(board.getSquare(4, 5)).toBe('B');
    // Sente's hand bishop count should now be 0
    expect(board.getHand('b').B).toBe(0);
  });

  it('clones board independently without mutating original', () => {
    const board1 = new ShogiBoard();
    const board2 = board1.clone();

    board2.applyMove({
      ply: 1,
      color: 'b',
      from: { file: 7, rank: 7 },
      to: { file: 7, rank: 6 },
      piece: 'FU',
      isDrop: false,
      kifString: '７六歩(77)',
      sfenMove: '7g7f',
    });

    // board1 must remain in initial position
    expect(board1.getSquare(7, 7)).toBe('P');
    expect(board1.getSquare(7, 6)).toBeNull();
    expect(board1.getTurn()).toBe('b');
    expect(board1.getPly()).toBe(1);

    // board2 must reflect the move
    expect(board2.getSquare(7, 7)).toBeNull();
    expect(board2.getSquare(7, 6)).toBe('P');
    expect(board2.getTurn()).toBe('w');
    expect(board2.getPly()).toBe(2);
  });

  it('accurately reconstructs board state from SFEN string using fromSfen', () => {
    const original = new ShogiBoard();
    original.applyMove({
      ply: 1,
      color: 'b',
      from: { file: 7, rank: 7 },
      to: { file: 7, rank: 6 },
      piece: 'FU',
      isDrop: false,
      kifString: '７六歩(77)',
      sfenMove: '7g7f',
    });
    original.applyMove({
      ply: 2,
      color: 'w',
      from: { file: 3, rank: 3 },
      to: { file: 3, rank: 4 },
      piece: 'FU',
      isDrop: false,
      kifString: '３四歩(33)',
      sfenMove: '3c3d',
    });

    const sfen = original.toSfen();
    const reconstructed = ShogiBoard.fromSfen(sfen);

    expect(reconstructed.toSfen()).toBe(sfen);
    expect(reconstructed.getSquare(7, 6)).toBe('P');
    expect(reconstructed.getSquare(3, 4)).toBe('p');
    expect(reconstructed.getTurn()).toBe('b');
    expect(reconstructed.getPly()).toBe(3);
  });
});
