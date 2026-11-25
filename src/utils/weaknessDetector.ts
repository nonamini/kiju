/**
 * Sparring Weakness Detector & Aggregator.
 * Analyzes sparring match history to detect recurring divergence points,
 * out-of-book errors, and positions that consistently lead to losses.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import { MatchRecord } from '../types/match';
import { MergedKifuTree, KifuTreeNode } from '../types/tree';
import { WeaknessPosition } from '../types/weakness';
import { ShogiBoard } from './shogiBoard';
import { parseUsiMove } from './shogiRules';
import { Color, Square } from '../types/shogi';

export interface WeaknessDetectionOptions {
  minLosses?: number; // Minimum number of losses required to flag a weakness (default: 1)
  trees?: Record<string, MergedKifuTree> | Map<string, MergedKifuTree>;
}

/**
 * Finds candidate book moves at a given ply by traversing the opening tree.
 */
function findBookMovesAtPly(
  tree: MergedKifuTree | undefined,
  moves: MatchRecord['moves'],
  targetPly: number
): string[] {
  if (!tree || !tree.rootNodes) return [];

  let currentChildren: KifuTreeNode[] = tree.rootNodes;
  for (let p = 1; p < targetPly; p++) {
    const targetMove = moves[p - 1];
    if (!targetMove) break;
    const matchingNode: KifuTreeNode | undefined = currentChildren.find(
      (n) => n.move.sfenMove === targetMove.sfenMove
    );
    if (!matchingNode || !matchingNode.children) {
      return [];
    }
    currentChildren = matchingNode.children;
  }

  return currentChildren.map((n) => n.move.sfenMove);
}

/**
 * Computes the board SFEN after applying a list of USI moves from start SFEN.
 */
function computeSfenAfterMoves(startSfen: string, usiMoves: string[]): string {
  try {
    const board = ShogiBoard.fromSfen(startSfen);
    let prevTo: Square | undefined;
    for (let i = 0; i < usiMoves.length; i++) {
      const usi = usiMoves[i];
      if (!usi) continue;
      const parsed = parseUsiMove(usi, board, i + 1, board.getTurn(), prevTo);
      if (parsed) {
        board.applyMove(parsed);
        prevTo = parsed.to;
      }
    }
    return board.toSfen();
  } catch {
    return startSfen;
  }
}

/**
 * Analyzes a list of match records and detects recurring weakness positions.
 */
export function detectWeaknessPositions(
  records: MatchRecord[],
  options: WeaknessDetectionOptions = {}
): WeaknessPosition[] {
  const minLosses = options.minLosses ?? 1;
  const trees = options.trees;

  const treeLookup = (openingId: string): MergedKifuTree | undefined => {
    if (!trees) return undefined;
    if (trees instanceof Map) return trees.get(openingId);
    return trees[openingId];
  };

  // Group candidates by cluster key
  interface WeaknessCluster {
    openingId: string;
    openingName?: string;
    ply: number;
    startSfen: string;
    usiMovesToPosition: string[];
    playerColor: Color;
    playedMoveUsi: string;
    bookMovesUsi: string[];
    losses: number;
    matches: number;
    lastLossAt: string;
    sourceMatchIds: string[];
  }

  const clusters = new Map<string, WeaknessCluster>();

  // Process only finished matches that have moves
  const lossRecords = records.filter(
    (r) => r.result === 'loss' && r.moves && r.moves.length > 0
  );

  for (const record of lossRecords) {
    const openingTree = treeLookup(record.openingId);
    const openingName = openingTree?.openingName;

    // Determine the key divergence/weakness ply
    let targetPly: number | null = null;

    if (record.outOfBookPly && record.outOfBookPly > 0) {
      const outPly = record.outOfBookPly;
      const isPlayerTurnAtOutOfBook =
        (record.userColor === 'b' && outPly % 2 === 1) ||
        (record.userColor === 'w' && outPly % 2 === 0);

      if (isPlayerTurnAtOutOfBook) {
        // Player diverged on their turn
        targetPly = outPly;
      } else {
        // Opponent diverged; player's next move is the first reply
        targetPly = Math.min(outPly + 1, record.moves.length);
      }
    } else if (record.moves.length >= 2) {
      // In-book loss or unrecorded outOfBook: take the last move by the player
      const lastIndex = record.moves.length - 1;
      const isPlayerTurnAtEnd =
        (record.userColor === 'b' && (lastIndex + 1) % 2 === 1) ||
        (record.userColor === 'w' && (lastIndex + 1) % 2 === 0);
      targetPly = isPlayerTurnAtEnd ? lastIndex + 1 : Math.max(1, lastIndex);
    }

    if (!targetPly || targetPly <= 0 || targetPly > record.moves.length) {
      continue;
    }

    const playedMove = record.moves[targetPly - 1];
    if (!playedMove) continue;

    const playedMoveUsi = playedMove.sfenMove;
    const usiMovesToPosition = record.moves.slice(0, targetPly - 1).map((m) => m.sfenMove);
    const playerColor = record.userColor;
    const bookMovesUsi = findBookMovesAtPly(openingTree, record.moves, targetPly);

    const clusterKey = `${record.openingId}:${targetPly}:${playedMoveUsi}`;
    const lossDate = record.endedAt || record.startedAt || new Date().toISOString();

    const existing = clusters.get(clusterKey);
    if (existing) {
      existing.losses += 1;
      existing.matches += 1;
      if (new Date(lossDate).getTime() > new Date(existing.lastLossAt).getTime()) {
        existing.lastLossAt = lossDate;
      }
      if (!existing.sourceMatchIds.includes(record.id)) {
        existing.sourceMatchIds.push(record.id);
      }
    } else {
      clusters.set(clusterKey, {
        openingId: record.openingId,
        openingName,
        ply: targetPly,
        startSfen: record.startSfen || 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
        usiMovesToPosition,
        playerColor,
        playedMoveUsi,
        bookMovesUsi,
        losses: 1,
        matches: 1,
        lastLossAt: lossDate,
        sourceMatchIds: [record.id],
      });
    }
  }

  // Convert clusters into WeaknessPosition objects
  const results: WeaknessPosition[] = [];

  for (const [key, cluster] of clusters.entries()) {
    if (cluster.losses < minLosses) continue;

    const sfen = computeSfenAfterMoves(cluster.startSfen, cluster.usiMovesToPosition);

    results.push({
      id: key,
      openingId: cluster.openingId,
      openingName: cluster.openingName,
      ply: cluster.ply,
      sfen,
      usiMovesToPosition: cluster.usiMovesToPosition,
      playerColor: cluster.playerColor,
      lossCount: cluster.losses,
      matchCount: cluster.matches,
      lastLossAt: cluster.lastLossAt,
      playedMoveUsi: cluster.playedMoveUsi,
      bookMovesUsi: cluster.bookMovesUsi,
      sourceMatchIds: cluster.sourceMatchIds,
    });
  }

  // Sort by loss count descending, then by last loss date descending
  results.sort((a, b) => {
    if (b.lossCount !== a.lossCount) {
      return b.lossCount - a.lossCount;
    }
    return new Date(b.lastLossAt).getTime() - new Date(a.lastLossAt).getTime();
  });

  return results;
}
