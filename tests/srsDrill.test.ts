/**
 * Unit Tests for SRS Drill Engine.
 * Verifies active recall move validation against tree variations,
 * opponent response selection, starting ply progression, and drill accuracy calculations.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import { describe, expect, it } from 'vitest';
import { ShogiMove } from '../src/types/shogi';
import { KifuTreeNode, MergedKifuTree } from '../src/types/tree';
import { ShogiBoard } from '../src/utils/shogiBoard';
import {
  advanceTreeToStartingPly,
  calculateDrillAccuracy,
  selectOpponentMove,
  validateUserMove,
} from '../src/utils/srsDrillEngine';

function createMockNode(
  id: string,
  ply: number,
  sfenMove: string,
  isMainline: boolean,
  gameCount: number = 5,
  children: KifuTreeNode[] = []
): KifuTreeNode {
  return {
    id,
    sfen: 'mock_sfen',
    move: {
      ply,
      color: ply % 2 === 1 ? 'b' : 'w',
      to: { file: 7, rank: 6 },
      piece: 'FU',
      isDrop: false,
      kifString: '７六歩(77)',
      sfenMove,
    },
    comment: '',
    gameCount,
    wins: { sente: 3, gote: 2, draw: 0 },
    gameRefs: [],
    children,
    isMainline,
  };
}

describe('srsDrillEngine', () => {
  const nodeMainlinePly2 = createMockNode('node_2a', 2, '3c3d', true, 10);
  const nodeAltPly2 = createMockNode('node_2b', 2, '8c8d', false, 3);
  const rootNode = createMockNode('node_1', 1, '7g7f', true, 13, [
    nodeMainlinePly2,
    nodeAltPly2,
  ]);

  const mockTree: MergedKifuTree = {
    openingId: 'yagura',
    openingName: 'Yagura',
    rootSfen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
    rootNodes: [rootNode],
    totalGames: 13,
    updatedAt: '2026-10-18T00:00:00.000Z',
  };

  it('validates correct user move against candidate nodes', () => {
    const attemptedMove: ShogiMove = {
      ply: 1,
      color: 'b',
      from: { file: 7, rank: 7 },
      to: { file: 7, rank: 6 },
      piece: 'FU',
      isDrop: false,
      kifString: '７六歩(77)',
      sfenMove: '7g7f',
    };

    const result = validateUserMove(attemptedMove, mockTree.rootNodes);
    expect(result.isValid).toBe(true);
    expect(result.matchedNode?.id).toBe('node_1');
  });

  it('rejects invalid/non-book user move against candidate nodes', () => {
    const invalidMove: ShogiMove = {
      ply: 1,
      color: 'b',
      from: { file: 2, rank: 7 },
      to: { file: 2, rank: 6 },
      piece: 'FU',
      isDrop: false,
      kifString: '２六歩(27)',
      sfenMove: '2g2f',
    };

    const result = validateUserMove(invalidMove, mockTree.rootNodes);
    expect(result.isValid).toBe(false);
    expect(result.matchedNode).toBeUndefined();
  });

  it('selects opponent move prioritizing mainline branch and adoption frequency', () => {
    const chosen = selectOpponentMove(rootNode.children);
    expect(chosen).not.toBeNull();
    expect(chosen?.id).toBe('node_2a');
    expect(chosen?.move.sfenMove).toBe('3c3d');
  });

  it('advances board and history along mainline to target starting ply', () => {
    const { startBoard, startMoves, startNode } = advanceTreeToStartingPly(
      2,
      mockTree
    );

    expect(startMoves).toHaveLength(2);
    expect(startMoves[0]?.sfenMove).toBe('7g7f');
    expect(startMoves[1]?.sfenMove).toBe('3c3d');
    expect(startNode?.id).toBe('node_2a');
    expect(startBoard.getPly()).toBe(3); // Board is ready for ply 3 move
  });

  it('calculates drill accuracy percentages correctly', () => {
    expect(calculateDrillAccuracy(0, 0)).toBe(100);
    expect(calculateDrillAccuracy(10, 0)).toBe(100);
    expect(calculateDrillAccuracy(5, 5)).toBe(50);
    expect(calculateDrillAccuracy(8, 2)).toBe(80);
    expect(calculateDrillAccuracy(1, 2)).toBe(33);
  });
});
