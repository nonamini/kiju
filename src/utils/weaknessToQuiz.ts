/**
 * Weakness to Tactical Quiz Converter.
 * Transforms a detected WeaknessPosition into a playable TacticalQuizCard
 * using opening tree continuations.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import { TacticalQuizCard } from '../types/quiz';
import { WeaknessPosition } from '../types/weakness';
import { MergedKifuTree, KifuTreeNode } from '../types/tree';

/**
 * Converts a WeaknessPosition into a TacticalQuizCard suitable for QuizPlayerPanel.
 */
export function weaknessToQuizCard(
  weakness: WeaknessPosition,
  tree?: MergedKifuTree
): TacticalQuizCard {
  const bestMove = weakness.bookMovesUsi[0] || '7g7f';
  let pv = [bestMove];

  // If tree is provided, extract continuation up to 3-5 plies
  if (tree && tree.rootNodes) {
    let currentNodes: KifuTreeNode[] = tree.rootNodes;
    for (let i = 0; i < weakness.usiMovesToPosition.length; i++) {
      const usi = weakness.usiMovesToPosition[i];
      if (!usi) break;
      const match = currentNodes.find((n) => n.move.sfenMove === usi);
      if (!match || !match.children) {
        currentNodes = [];
        break;
      }
      currentNodes = match.children;
    }

    const bestNode = currentNodes.find((n) => n.move.sfenMove === bestMove);
    if (bestNode) {
      const continuation: string[] = [bestMove];
      let cursor: KifuTreeNode | undefined = bestNode;
      while (cursor && cursor.children && cursor.children.length > 0 && continuation.length < 5) {
        const nextNode: KifuTreeNode | undefined =
          cursor.children.find((c) => c.isMainline) ?? cursor.children[0];
        if (nextNode) {
          continuation.push(nextNode.move.sfenMove);
          cursor = nextNode;
        } else {
          break;
        }
      }
      // Ensure odd length for quiz solver sequence (user, reply, user)
      if (continuation.length % 2 === 0) {
        continuation.pop();
      }
      if (continuation.length > 0) {
        pv = continuation;
      }
    }
  }

  return {
    id: `weakness:${weakness.id}`,
    sourceGameId: `weakness:${weakness.openingId}`,
    openingId: weakness.openingId,
    type: 'defense',
    ply: weakness.ply,
    startSfen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
    usiMovesToPosition: weakness.usiMovesToPosition,
    sideToMove: weakness.playerColor,
    bestMove: pv[0] ?? bestMove,
    pv,
    scoreCpBefore: 0,
    actualMove: weakness.playedMoveUsi,
    isEnabled: true,
    createdAt: weakness.lastLossAt || new Date().toISOString(),
  };
}
