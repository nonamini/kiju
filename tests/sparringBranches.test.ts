import { describe, expect, it } from 'vitest';
import { sanitizeMoveBranches } from '../src/hooks/useSparringMatch';
import { ShogiMove } from '../src/types/shogi';

describe('sanitizeMoveBranches', () => {
  it('returns clean moves untouched when history is strictly sequential', () => {
    const moves: ShogiMove[] = [
      { ply: 1, color: 'b', to: { file: 7, rank: 6 }, piece: 'FU', isDrop: false, kifString: '７六歩(77)', sfenMove: '7g7f' },
      { ply: 2, color: 'w', to: { file: 3, rank: 4 }, piece: 'FU', isDrop: false, kifString: '３四歩(33)', sfenMove: '3c3d' },
      { ply: 3, color: 'b', to: { file: 2, rank: 6 }, piece: 'FU', isDrop: false, kifString: '２六歩(27)', sfenMove: '2g2f' },
    ];

    const result = sanitizeMoveBranches(moves);
    expect(result.detectedBranches).toHaveLength(0);
    expect(result.cleanMoves).toHaveLength(3);
    expect(result.cleanMoves[2]?.ply).toBe(3);
  });

  it('splits accidental branch concatenations into distinct branches', () => {
    // Simulates:
    // Move 1..2 common
    // Branch 1: ply 3, ply 4, ply 5
    // Branch 2: ply 3, ply 4
    const moves: ShogiMove[] = [
      { ply: 1, color: 'b', to: { file: 7, rank: 6 }, piece: 'FU', isDrop: false, kifString: '７六歩(77)', sfenMove: '7g7f' },
      { ply: 2, color: 'w', to: { file: 3, rank: 4 }, piece: 'FU', isDrop: false, kifString: '３四歩(33)', sfenMove: '3c3d' },
      // Branch 1: 3..5
      { ply: 3, color: 'b', to: { file: 2, rank: 6 }, piece: 'FU', isDrop: false, kifString: '２六歩(27)', sfenMove: '2g2f' },
      { ply: 4, color: 'w', to: { file: 8, rank: 4 }, piece: 'FU', isDrop: false, kifString: '８四歩(83)', sfenMove: '8c8d' },
      { ply: 5, color: 'b', to: { file: 2, rank: 5 }, piece: 'FU', isDrop: false, kifString: '２五歩(26)', sfenMove: '2f2e' },
      // Branch 2 concatenated: ply 3 again!
      { ply: 3, color: 'b', to: { file: 6, rank: 8 }, piece: 'GI', isDrop: false, kifString: '６八銀(79)', sfenMove: '7i6h' },
      { ply: 4, color: 'w', to: { file: 8, rank: 4 }, piece: 'FU', isDrop: false, kifString: '８四歩(83)', sfenMove: '8c8d' },
    ];

    const result = sanitizeMoveBranches(moves);
    expect(result.detectedBranches).toHaveLength(2);

    // Branch 1: 5 moves (1..5)
    expect(result.detectedBranches[0]?.moves).toHaveLength(5);
    expect(result.detectedBranches[0]?.moves.map((m) => m.sfenMove)).toEqual([
      '7g7f', '3c3d', '2g2f', '8c8d', '2f2e',
    ]);

    // Branch 2: 4 moves (1, 2, then branch moves 3, 4)
    expect(result.detectedBranches[1]?.moves).toHaveLength(4);
    expect(result.detectedBranches[1]?.moves.map((m) => m.sfenMove)).toEqual([
      '7g7f', '3c3d', '7i6h', '8c8d',
    ]);

    // Clean active moves should be branch 2
    expect(result.cleanMoves).toEqual(result.detectedBranches[1]?.moves);
  });
});
