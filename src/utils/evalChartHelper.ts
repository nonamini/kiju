/**
 * Evaluation Chart Helper Utilities.
 * Formats evaluation scores, clamps centipawns for chart scaling,
 * and converts KifuTreeNode/ShogiMove arrays into Chart.js datasets.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import { KifuTreeNode } from '../types/tree';
import { ShogiMove } from '../types/shogi';

export interface EvalDataPoint {
  ply: number;
  scoreCp: number | null; // clamped centipawns for graph display (null if unanalyzed)
  rawScoreCp: number | null; // actual centipawns (-30000..+30000 or actual)
  moveText: string; // e.g. "▲７六歩" or "Start"
  isMate?: boolean;
  matePly?: number;
  depth?: number;
  bestMove?: string;
  bestMoveKif?: string;
}

export const EVAL_SCORE_LIMIT = 2000;

/**
 * Clamps centipawn values within defined visual boundaries (default: ±2000).
 */
export function clampEvalForChart(scoreCp: number, limit = EVAL_SCORE_LIMIT): number {
  return Math.max(-limit, Math.min(limit, scoreCp));
}

/**
 * Formats evaluation score for header display or tooltip.
 */
export function formatEvalScore(
  scoreCp: number | null | undefined,
  isMate?: boolean,
  matePly?: number
): string {
  if (scoreCp === null || scoreCp === undefined) {
    return '-';
  }
  if (isMate) {
    if (matePly === 0) {
      return scoreCp > 0 ? '+詰み (後手詰まされ・先手勝)' : '-詰み (先手詰まされ・後手勝)';
    }
    const prefix = scoreCp >= 0 ? '+' : '-';
    const winningSide = scoreCp >= 0 ? '先手勝' : '後手勝';
    if (matePly !== undefined) {
      return `${prefix}詰み (${matePly}手・${winningSide})`;
    }
    return `${prefix}詰み (${winningSide})`;
  }
  const prefix = scoreCp > 0 ? '+' : '';
  return `${prefix}${scoreCp}`;
}

/**
 * Resolves i18n translation key describing the positional advantage.
 */
export function getEvalAdvantageKey(
  scoreCp: number | null | undefined,
  isMate?: boolean
): string {
  if (scoreCp === null || scoreCp === undefined) {
    return 'eval.no_eval_data';
  }
  if (isMate) {
    return scoreCp >= 0 ? 'eval.sente_mate' : 'eval.gote_mate';
  }
  if (scoreCp >= 800) return 'eval.sente_advantage';
  if (scoreCp >= 200) return 'eval.sente_slight';
  if (scoreCp <= -800) return 'eval.gote_advantage';
  if (scoreCp <= -200) return 'eval.gote_slight';
  return 'eval.even';
}

/**
 * Transforms an active KifuTreeNode path into aligned evaluation chart points.
 * Includes ply 0 (initial position) as baseline 0.
 */
export function buildEvalChartPointsFromPath(path: KifuTreeNode[]): EvalDataPoint[] {
  const points: EvalDataPoint[] = [];

  // Root starting position (Ply 0)
  points.push({
    ply: 0,
    scoreCp: 0,
    rawScoreCp: 0,
    moveText: 'Start',
  });

  for (const node of path) {
    const move = node.move;
    const evaluation = node.evaluation ?? move.evaluation;

    if (evaluation) {
      const isMate = evaluation.isMate;
      const matePly = evaluation.matePly;
      const rawScore = evaluation.scoreCp;
      const clampedScore = isMate
        ? rawScore >= 0
          ? EVAL_SCORE_LIMIT
          : -EVAL_SCORE_LIMIT
        : clampEvalForChart(rawScore, EVAL_SCORE_LIMIT);

      points.push({
        ply: move.ply,
        scoreCp: clampedScore,
        rawScoreCp: rawScore,
        moveText: move.kifString,
        isMate,
        matePly,
        depth: evaluation.depth,
        bestMove: evaluation.bestMove,
        bestMoveKif: evaluation.bestMoveKif,
      });
    } else {
      points.push({
        ply: move.ply,
        scoreCp: null,
        rawScoreCp: null,
        moveText: move.kifString,
      });
    }
  }

  return points;
}

/**
 * Transforms a ShogiMove array into aligned evaluation chart points.
 */
export function buildEvalChartPointsFromMoves(moves: ShogiMove[]): EvalDataPoint[] {
  const points: EvalDataPoint[] = [];

  points.push({
    ply: 0,
    scoreCp: 0,
    rawScoreCp: 0,
    moveText: 'Start',
  });

  for (const move of moves) {
    const evaluation = move.evaluation;
    if (evaluation) {
      const isMate = evaluation.isMate;
      const matePly = evaluation.matePly;
      const rawScore = evaluation.scoreCp;
      const clampedScore = isMate
        ? rawScore >= 0
          ? EVAL_SCORE_LIMIT
          : -EVAL_SCORE_LIMIT
        : clampEvalForChart(rawScore, EVAL_SCORE_LIMIT);

      points.push({
        ply: move.ply,
        scoreCp: clampedScore,
        rawScoreCp: rawScore,
        moveText: move.kifString,
        isMate,
        matePly,
        depth: evaluation.depth,
        bestMove: evaluation.bestMove,
        bestMoveKif: evaluation.bestMoveKif,
      });
    } else {
      points.push({
        ply: move.ply,
        scoreCp: null,
        rawScoreCp: null,
        moveText: move.kifString,
      });
    }
  }

  return points;
}
