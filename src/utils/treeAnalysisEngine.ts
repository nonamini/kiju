/**
/**
 * Tree & Game Batch Analysis Engine.
 * Collects unique nodes from MergedKifuTree, tracks move histories for USI replay,
 * executes engine position evaluation, and attaches MoveEvaluation results.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import { KifuTreeNode, MergedKifuTree } from '../types/tree';
import { Color, MoveEvaluation, ShogiMove } from '../types/shogi';
import { ShogiBoard } from './shogiBoard';
import { formatShogiMove, parseUsiMove } from './shogiRules';
import { EngineSearchResult } from '../engine/types';

export interface PositionToAnalyze {
  node: KifuTreeNode;
  usiMoves: string[];
  ply: number;
  color: Color;
  board: ShogiBoard;
}

export interface BatchAnalysisProgress {
  analyzedCount: number;
  totalCount: number;
  skippedCount: number;
  percent: number;
  currentNodeId: string;
  currentMoveKif: string;
  currentPly: number;
  evaluation?: MoveEvaluation;
}

export interface BatchAnalysisOptions {
  movetimeMs?: number;
  depth?: number;
  skipAlreadyAnalyzed?: boolean;
  onProgress?: (progress: BatchAnalysisProgress) => void;
  signal?: AbortSignal;
}

/**
 * Interface representing the engine search capability needed for batch analysis.
 */
export interface EngineSearchProvider {
  searchPosition: (
    sfen?: string,
    moves?: string[],
    options?: { depth?: number; movetime?: number }
  ) => Promise<EngineSearchResult>;
  stop?: () => void;
}

/**
 * Traverses a MergedKifuTree and collects all unique nodes with their full move sequences.
 */
export function collectUniqueTreeNodes(
  tree: MergedKifuTree,
  skipAlreadyAnalyzed = false
): PositionToAnalyze[] {
  const result: PositionToAnalyze[] = [];
  const visitedNodeIds = new Set<string>();

  function traverse(
    node: KifuTreeNode,
    currentBoard: ShogiBoard,
    currentUsiMoves: string[]
  ) {
    if (visitedNodeIds.has(node.id)) return;
    visitedNodeIds.add(node.id);

    const nextMoves = [...currentUsiMoves, node.move.sfenMove];
    const nextBoard = currentBoard.clone();
    nextBoard.applyMove(node.move);

    if (!skipAlreadyAnalyzed || !node.evaluation) {
      result.push({
        node,
        usiMoves: nextMoves,
        ply: node.move.ply,
        color: node.move.color,
        board: nextBoard,
      });
    }

    for (const child of node.children) {
      traverse(child, nextBoard, nextMoves);
    }
  }

  const initialBoard = new ShogiBoard();
  for (const root of tree.rootNodes) {
    traverse(root, initialBoard, []);
  }

  return result;
}

/**
 * Collects analysis positions from an active linear path of KifuTreeNodes.
 */
export function collectPathNodes(
  path: KifuTreeNode[],
  skipAlreadyAnalyzed = false
): PositionToAnalyze[] {
  const result: PositionToAnalyze[] = [];
  const currentBoard = new ShogiBoard();
  const currentUsiMoves: string[] = [];

  for (const node of path) {
    currentUsiMoves.push(node.move.sfenMove);
    currentBoard.applyMove(node.move);

    if (!skipAlreadyAnalyzed || !node.evaluation) {
      result.push({
        node,
        usiMoves: [...currentUsiMoves],
        ply: node.move.ply,
        color: node.move.color,
        board: currentBoard.clone(),
      });
    }
  }

  return result;
}

/**
 * Converts a best move USI string (e.g., '2g2f') into readable Japanese notation (e.g., '▲２六歩(27)').
 */
export function formatBestMoveKifString(
  bestMoveUsi: string | undefined,
  board: ShogiBoard,
  ply: number,
  sideToMove: Color
): string | undefined {
  if (!bestMoveUsi || bestMoveUsi === 'none' || bestMoveUsi === 'resign') {
    return undefined;
  }

  try {
    const parsed = parseUsiMove(bestMoveUsi, board, ply, sideToMove);
    if (!parsed) return bestMoveUsi;
    return formatShogiMove(parsed);
  } catch {
    return bestMoveUsi;
  }
}

/**
 * Executes batch analysis on a set of collected positions using an engine provider.
 * Returns an evaluation map mapping node ID to its MoveEvaluation.
 */
export async function executeBatchAnalysis(
  positions: PositionToAnalyze[],
  engine: EngineSearchProvider,
  options: BatchAnalysisOptions = {}
): Promise<Map<string, MoveEvaluation>> {
  const {
    movetimeMs = 250,
    depth,
    onProgress,
    signal,
  } = options;

  const evaluationMap = new Map<string, MoveEvaluation>();
  const totalCount = positions.length;

  for (let i = 0; i < totalCount; i++) {
    if (signal?.aborted) {
      if (engine.stop) engine.stop();
      break;
    }

    const item = positions[i];
    if (!item) continue;

    // Next turn on the resulting position
    const nextSideToMove: Color = item.color === 'b' ? 'w' : 'b';

    const searchResult = await engine.searchPosition(undefined, item.usiMoves, {
      movetime: movetimeMs,
      depth,
    });

    const bestMoveUsi = searchResult.bestMove?.trim();
    const bestMoveKif = formatBestMoveKifString(
      bestMoveUsi,
      item.board,
      item.ply + 1,
      nextSideToMove
    );

    const evaluation: MoveEvaluation = {
      scoreCp: searchResult.evaluation?.scoreCp ?? 0,
      depth: searchResult.evaluation?.depth ?? depth ?? 10,
      bestMove: bestMoveUsi,
      bestMoveKif,
      pv: searchResult.evaluation?.pv,
      isMate: searchResult.evaluation?.isMate,
      matePly: searchResult.evaluation?.matePly,
      evaluatedAt: new Date().toISOString(),
    };

    evaluationMap.set(item.node.id, evaluation);

    if (onProgress) {
      const analyzedCount = i + 1;
      const percent = Math.round((analyzedCount / totalCount) * 100);
      onProgress({
        analyzedCount,
        totalCount,
        skippedCount: 0,
        percent,
        currentNodeId: item.node.id,
        currentMoveKif: item.node.move.kifString,
        currentPly: item.ply,
        evaluation,
      });
    }

    if (signal?.aborted) {
      if (engine.stop) engine.stop();
      break;
    }
  }

  return evaluationMap;
}

/**
 * Immutably applies calculated MoveEvaluations to a MergedKifuTree.
 */
export function applyEvaluationsToTree(
  tree: MergedKifuTree,
  evaluationMap: Map<string, MoveEvaluation>
): MergedKifuTree {
  function mapNode(node: KifuTreeNode): KifuTreeNode {
    const updatedEval = evaluationMap.get(node.id) ?? node.evaluation;
    const updatedMove: ShogiMove = updatedEval
      ? { ...node.move, evaluation: updatedEval }
      : node.move;

    return {
      ...node,
      move: updatedMove,
      evaluation: updatedEval,
      children: node.children.map(mapNode),
    };
  }

  return {
    ...tree,
    rootNodes: tree.rootNodes.map(mapNode),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Immutably applies calculated MoveEvaluations to an active path array.
 */
export function applyEvaluationsToPath(
  path: KifuTreeNode[],
  evaluationMap: Map<string, MoveEvaluation>
): KifuTreeNode[] {
  return path.map((node) => {
    const updatedEval = evaluationMap.get(node.id) ?? node.evaluation;
    const updatedMove: ShogiMove = updatedEval
      ? { ...node.move, evaluation: updatedEval }
      : node.move;

    return {
      ...node,
      move: updatedMove,
      evaluation: updatedEval,
      children: node.children,
    };
  });
}
