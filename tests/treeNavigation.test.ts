/**
 * Unit Tests for Multi-Branch Shogi Tree Navigation Utilities.
 * Verifies mainline path extraction, branch switching, candidate move resolution,
 * and board state derivation from tree branches.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import { describe, expect, it } from 'vitest';
import { KifuTreeNode, MergedKifuTree } from '../src/types/tree';
import {
  deriveBoardHistoryFromPath,
  extractMovesFromPath,
  findPathToNode,
  getCandidateMovesAtPly,
  getDefaultMainlinePath,
  switchBranchAtPly,
  updateNodeCommentInTree,
  updateNodeCommentInPath,
} from '../src/utils/treeNavigation';

function createDummyNode(
  id: string,
  ply: number,
  kifString: string,
  isMainline: boolean,
  children: KifuTreeNode[] = []
): KifuTreeNode {
  return {
    id,
    sfen: 'dummy_sfen',
    move: {
      ply,
      color: ply % 2 === 1 ? 'b' : 'w',
      to: { file: 7, rank: 6 },
      piece: 'FU',
      isDrop: false,
      kifString,
      sfenMove: '7g7f',
    },
    comment: '',
    gameCount: isMainline ? 8 : 4,
    wins: { sente: 5, gote: 3, draw: 0 },
    gameRefs: [],
    children,
    isMainline,
  };
}

describe('Tree Navigation Utilities', () => {
  // Construct a 3-ply tree with a branching juncture at ply 2
  // Move 1: 7g7f (Mainline)
  //   Move 2a: 3c3d (Mainline) -> Move 3a: 2g2f
  //   Move 2b: 8c8d (Variation) -> Move 3b: 7f7e
  const node3a = createDummyNode('node_3a', 3, '▲２六歩', true, []);
  const node2a = createDummyNode('node_2a', 2, '△３四歩', true, [node3a]);

  const node3b = createDummyNode('node_3b', 3, '▲７五歩', true, []);
  const node2b = createDummyNode('node_2b', 2, '△８四歩', false, [node3b]);

  const rootNode = createDummyNode('node_1', 1, '▲７六歩', true, [node2a, node2b]);

  const sampleTree: MergedKifuTree = {
    openingId: 'sample',
    openingName: 'Sample Opening',
    rootSfen: 'initial',
    rootNodes: [rootNode],
    totalGames: 12,
    updatedAt: '2026-10-15T00:00:00Z',
  };

  it('correctly extracts default mainline path', () => {
    const path = getDefaultMainlinePath(sampleTree);
    expect(path.length).toBe(3);
    expect(path[0]?.id).toBe('node_1');
    expect(path[1]?.id).toBe('node_2a');
    expect(path[2]?.id).toBe('node_3a');
  });

  it('returns empty path for empty or null tree', () => {
    expect(getDefaultMainlinePath(null)).toEqual([]);
    expect(getDefaultMainlinePath({ ...sampleTree, rootNodes: [] })).toEqual([]);
  });

  it('finds path to any existing node in the tree', () => {
    const pathTo2b = findPathToNode(sampleTree.rootNodes, 'node_2b');
    expect(pathTo2b).toBeDefined();
    expect(pathTo2b?.length).toBe(2);
    expect(pathTo2b?.[0]?.id).toBe('node_1');
    expect(pathTo2b?.[1]?.id).toBe('node_2b');

    const pathTo3b = findPathToNode(sampleTree.rootNodes, 'node_3b');
    expect(pathTo3b?.length).toBe(3);
    expect(pathTo3b?.[2]?.id).toBe('node_3b');

    const nonExistent = findPathToNode(sampleTree.rootNodes, 'non_existent');
    expect(nonExistent).toBeNull();
  });

  it('retrieves candidate moves at junction plies', () => {
    const mainlinePath = getDefaultMainlinePath(sampleTree);

    // Candidates at ply 1 (root moves)
    const ply1Candidates = getCandidateMovesAtPly(sampleTree, mainlinePath, 1);
    expect(ply1Candidates.length).toBe(1);
    expect(ply1Candidates[0]?.id).toBe('node_1');

    // Candidates at ply 2 (children of ply 1)
    const ply2Candidates = getCandidateMovesAtPly(sampleTree, mainlinePath, 2);
    expect(ply2Candidates.length).toBe(2);
    expect(ply2Candidates[0]?.id).toBe('node_2a');
    expect(ply2Candidates[1]?.id).toBe('node_2b');

    // Candidates at ply 3 (children of ply 2a)
    const ply3Candidates = getCandidateMovesAtPly(sampleTree, mainlinePath, 3);
    expect(ply3Candidates.length).toBe(1);
    expect(ply3Candidates[0]?.id).toBe('node_3a');

    // Out of bounds ply
    expect(getCandidateMovesAtPly(sampleTree, mainlinePath, 0)).toEqual([]);
    expect(getCandidateMovesAtPly(sampleTree, mainlinePath, 99)).toEqual([]);
  });

  it('seamlessly switches active branch at a junction ply and extends with new mainline', () => {
    const mainlinePath = getDefaultMainlinePath(sampleTree);
    expect(mainlinePath.map((n) => n.id)).toEqual(['node_1', 'node_2a', 'node_3a']);

    // Switch branch at ply 2 from node_2a to node_2b
    const newPath = switchBranchAtPly(mainlinePath, node2b, 2);
    expect(newPath.length).toBe(3);
    expect(newPath[0]?.id).toBe('node_1'); // Preserved ply 1
    expect(newPath[1]?.id).toBe('node_2b'); // Switched ply 2
    expect(newPath[2]?.id).toBe('node_3b'); // Downstream mainline of node_2b
  });

  it('derives board history and move list from an active path', () => {
    const mainlinePath = getDefaultMainlinePath(sampleTree);
    const moves = extractMovesFromPath(mainlinePath);
    expect(moves.length).toBe(3);
    expect(moves[0]?.kifString).toBe('▲７六歩');

    const boardHistory = deriveBoardHistoryFromPath(mainlinePath);
    expect(boardHistory.length).toBe(4); // index 0 is Hirate board + 3 moves
    expect(boardHistory[0]?.getPly()).toBe(1);
    expect(boardHistory[1]?.getPly()).toBe(2);
    expect(boardHistory[2]?.getPly()).toBe(3);
    expect(boardHistory[3]?.getPly()).toBe(4);
  });

  it('immutably updates node comment in tree and active path', () => {
    const mainlinePath = getDefaultMainlinePath(sampleTree);
    const updatedPath = updateNodeCommentInPath(mainlinePath, 'node_2a', 'User study note for 34fu');
    expect(updatedPath[1]?.comment).toBe('User study note for 34fu');
    expect(mainlinePath[1]?.comment).toBe(''); // Immutability preserved

    const updatedTree = updateNodeCommentInTree(sampleTree, 'node_2a', 'Tree note');
    expect(updatedTree.rootNodes[0]?.children[0]?.comment).toBe('Tree note');
    expect(sampleTree.rootNodes[0]?.children[0]?.comment).toBe(''); // Original untouched
  });
});
