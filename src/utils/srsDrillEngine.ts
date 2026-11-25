/**
 * Pure Engine Logic for Active Recall SRS Drill.
 * Handles move validation against tree variations,
 * automated opponent move selection, and mainline traversal to starting ply.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import { ShogiMove } from '../types/shogi';
import { KifuTreeNode, MergedKifuTree } from '../types/tree';
import { ShogiBoard } from './shogiBoard';

export interface MoveValidationResult {
  isValid: boolean;
  matchedNode?: KifuTreeNode;
}

/**
 * Validates a user's attempted move against expected candidate nodes from the tree.
 * Matches on sfenMove (e.g. "7g7f", "G*5b") or unique node ID.
 */
export function validateUserMove(
  move: ShogiMove,
  expectedCandidates: KifuTreeNode[]
): MoveValidationResult {
  const matched = expectedCandidates.find(
    (c) => c.move.sfenMove === move.sfenMove || c.id === move.sfenMove
  );

  if (matched) {
    return { isValid: true, matchedNode: matched };
  }
  return { isValid: false };
}

/**
 * Selects an opponent response from candidate variations.
 * Prioritizes mainline branches and adoption frequency (gameCount).
 */
export function selectOpponentMove(candidates: KifuTreeNode[]): KifuTreeNode | null {
  if (candidates.length === 0) return null;

  const sorted = [...candidates].sort((a, b) => {
    if (a.isMainline && !b.isMainline) return -1;
    if (!a.isMainline && b.isMainline) return 1;
    return b.gameCount - a.gameCount;
  });

  return sorted[0] ?? null;
}

/**
 * Advances a fresh Shogi board along the tree mainline or a specific branch path to a target starting ply.
 */
export function advanceTreeToStartingPly(
  targetPly: number,
  tree: MergedKifuTree | null,
  activePath?: KifuTreeNode[]
): {
  startBoard: ShogiBoard;
  startMoves: ShogiMove[];
  startNode: KifuTreeNode | null;
} {
  const startBoard = new ShogiBoard();
  const startMoves: ShogiMove[] = [];
  let startNode: KifuTreeNode | null = null;

  if (!tree || targetPly <= 0) {
    return { startBoard, startMoves, startNode };
  }

  // If user provided a specific branch path that covers up to targetPly
  if (activePath && activePath.length >= targetPly) {
    for (let p = 0; p < targetPly; p++) {
      const node = activePath[p];
      if (!node) break;
      startBoard.applyMove(node.move);
      startMoves.push(node.move);
      startNode = node;
    }
    return { startBoard, startMoves, startNode };
  }

  let candidateList = tree.rootNodes;
  for (let p = 1; p <= targetPly; p++) {
    const mainlineCandidate =
      candidateList.find((c) => c.isMainline) ?? candidateList[0];
    if (!mainlineCandidate) break;

    startBoard.applyMove(mainlineCandidate.move);
    startMoves.push(mainlineCandidate.move);
    startNode = mainlineCandidate;
    candidateList = mainlineCandidate.children;
  }

  return { startBoard, startMoves, startNode };
}

/**
 * Calculates percentage accuracy given correct and mistake counts.
 */
export function calculateDrillAccuracy(correctCount: number, mistakeCount: number): number {
  const total = correctCount + mistakeCount;
  if (total === 0) return 100;
  return Math.round((correctCount / total) * 100);
}
