/**
 * Tsume-shogi Mate Checker Utility.
 * Verifies whether a custom position has a forced checkmate within `maxPly`:
 * 1. Structural guards (defender king must exist and must not start in check).
 * 2. Bounded check-only AND/OR search (works even on kingless tsume-shogi SFENs).
 * 3. Optional Wasm engine fallback when both kings are present on the board.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import { Color } from '../types/shogi';
import { EngineSearchResult } from '../engine/types';
import { ShogiBoard } from './shogiBoard';
import {
  findKing,
  getAllStrictLegalMoves,
  isKingInCheck,
  parseUsiMove,
} from './shogiRules';

export interface TsumeMateCheckResult {
  hasMate: boolean;
  matePly?: number;
  solutionPv?: string[];
  reasonKey?:
    | 'position_editor.mate_err_no_defender_king'
    | 'position_editor.mate_err_already_in_check'
    | 'position_editor.mate_not_found';
}

export type EngineMateSearchFn = (
  sfen: string,
  moves?: string[],
  options?: { depth?: number; movetime?: number }
) => Promise<EngineSearchResult>;

const MAX_SOLVER_NODES = 20000;
const SOLVER_TIME_BUDGET_MS = 1500;

interface CandidateMove {
  usi: string;
  board: ShogiBoard;
  priority: number;
}

/**
 * Generates all legal checking moves for `attacker`, ordered by proximity to the defending King.
 */
function generateOrderedCheckingMoves(
  board: ShogiBoard,
  attacker: Color,
  defender: Color,
  ply: number
): CandidateMove[] {
  const defenderKing = findKing(board, defender);
  if (!defenderKing) return [];

  const legal = getAllStrictLegalMoves(board, attacker);
  const checks: CandidateMove[] = [];

  for (const mv of legal) {
    const parsed = parseUsiMove(mv.usi, board, ply, attacker);
    if (!parsed) continue;
    const nextBoard = ShogiBoard.fromSfen(board.toSfen());
    nextBoard.applyMove(parsed);
    if (!isKingInCheck(nextBoard, defender)) continue;

    const dist = Math.abs(mv.to.file - defenderKing.file) + Math.abs(mv.to.rank - defenderKing.rank);
    const isCapture = Boolean(board.getSquare(mv.to.file, mv.to.rank));
    const priority = (isCapture ? 10 : 0) + (mv.dropPiece ? 4 : 0) - dist;
    checks.push({ usi: mv.usi, board: nextBoard, priority });
  }

  checks.sort((a, b) => b.priority - a.priority);
  return checks;
}

/**
 * Check whether `sfen` has a forced checkmate within `maxPly` moves.
 */
export async function checkTsumeMate(
  sfen: string,
  maxPly: number,
  engineSearchFn?: EngineMateSearchFn
): Promise<TsumeMateCheckResult> {
  const board = ShogiBoard.fromSfen(sfen);
  const turnToken = sfen.trim().split(/\s+/)[1];
  const attacker: Color = turnToken === 'w' ? 'w' : 'b';
  const defender: Color = attacker === 'b' ? 'w' : 'b';

  const defenderKing = findKing(board, defender);
  if (!defenderKing) {
    return { hasMate: false, reasonKey: 'position_editor.mate_err_no_defender_king' };
  }

  if (isKingInCheck(board, defender)) {
    return { hasMate: false, reasonKey: 'position_editor.mate_err_already_in_check' };
  }

  const deadline = Date.now() + SOLVER_TIME_BUDGET_MS;
  let nodes = 0;
  let aborted = false;

  const solveAttacker = (curBoard: ShogiBoard, remainingPly: number, depthPly: number): string[] | null => {
    if (aborted) return null;
    nodes += 1;
    if (nodes > MAX_SOLVER_NODES || Date.now() > deadline) {
      aborted = true;
      return null;
    }

    const checks = generateOrderedCheckingMoves(curBoard, attacker, defender, depthPly);
    for (const chk of checks) {
      if (aborted) return null;
      if (remainingPly <= 1) {
        const evasions = getAllStrictLegalMoves(chk.board, defender);
        if (evasions.length === 0) {
          return [chk.usi];
        }
        continue;
      }

      const defPv = solveDefender(chk.board, remainingPly - 1, depthPly + 1);
      if (defPv !== null) {
        return [chk.usi, ...defPv];
      }
    }

    return null;
  };

  const solveDefender = (curBoard: ShogiBoard, remainingPly: number, depthPly: number): string[] | null => {
    if (aborted) return null;
    nodes += 1;
    if (nodes > MAX_SOLVER_NODES || Date.now() > deadline) {
      aborted = true;
      return null;
    }

    const evasions = getAllStrictLegalMoves(curBoard, defender);
    if (evasions.length === 0) {
      return [];
    }
    if (remainingPly <= 0) {
      return null;
    }

    let longestPv: string[] | null = null;
    for (const eva of evasions) {
      if (aborted) return null;
      const parsed = parseUsiMove(eva.usi, curBoard, depthPly, defender);
      if (!parsed) continue;
      const nextBoard = ShogiBoard.fromSfen(curBoard.toSfen());
      nextBoard.applyMove(parsed);

      const attPv = solveAttacker(nextBoard, remainingPly - 1, depthPly + 1);
      if (attPv === null) {
        return null;
      }
      const line = [eva.usi, ...attPv];
      if (!longestPv || line.length > longestPv.length) {
        longestPv = line;
      }
    }

    return longestPv;
  };

  // Bounded iterative deepening for fast JS verification up to 7 ply
  const jsCap = Math.min(Math.max(1, maxPly), 7);
  for (let limit = 1; limit <= jsCap; limit += 2) {
    aborted = false;
    const pv = solveAttacker(board, limit, 1);
    if (pv && pv.length > 0) {
      return {
        hasMate: true,
        matePly: pv.length,
        solutionPv: pv,
      };
    }
    if (aborted) break;
  }

  // Fallback to Wasm engine when both Kings exist on the board
  const attackerKing = findKing(board, attacker);
  if (engineSearchFn && attackerKing) {
    try {
      const res = await engineSearchFn(sfen, undefined, {
        depth: Math.max(14, maxPly + 4),
        movetime: 3000,
      });
      const ev = res.evaluation;
      const attackerWins =
        ev?.isMate === true &&
        typeof ev.matePly === 'number' &&
        ev.matePly > 0 &&
        ev.matePly <= maxPly &&
        (attacker === 'b' ? ev.scoreCp > 0 : ev.scoreCp < 0);

      if (attackerWins && ev) {
        const pv = ev.pv && ev.pv.length > 0 ? ev.pv : res.bestMove ? [res.bestMove] : [];
        return {
          hasMate: true,
          matePly: ev.matePly,
          solutionPv: pv,
        };
      }
    } catch (err) {
      console.warn('[TsumeMateChecker] Engine mate check failed:', err);
    }
  }

  return { hasMate: false, reasonKey: 'position_editor.mate_not_found' };
}
