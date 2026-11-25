/**
 * Manual Tsumego PV validation & AI-analyzed KifuRecord auto-extraction (Issues #162, #170).
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import { JKFPlayer } from 'json-kifu-format';
import type { KifuRecord } from '../types/kifuRecord';
import type { Color } from '../types/shogi';
import type { TsumegoProblem } from '../types/tsumego';
import { ShogiBoard } from './shogiBoard';
import {
  getAllStrictLegalMoves,
  isKingInCheck,
  parseUsiMove,
} from './shogiRules';
import { cleanJkfFalsyPromotions } from './usiFormatter';

export interface ManualTsumegoPvValidationResult {
  valid: boolean;
  matePly?: number;
  normalizedPv?: string[];
  reasonKey?: string;
}

/**
 * Splits a user-entered PV text into normalized USI move tokens.
 */
export function parsePvInputString(input: string): string[] {
  return input
    .trim()
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

/**
 * Validates a sequence of USI moves from `startSfen` as a forced checkmate line:
 * - Non-empty, odd move count (attacker starts and finishes with mate)
 * - Every move is strictly legal for its side to move
 * - Every attacker move (even indices) puts the defender's King in check
 * - After the final move, the defender has zero legal moves (checkmate)
 */
export function validateManualTsumegoPv(
  startSfen: string,
  pvMoves: string[]
): ManualTsumegoPvValidationResult {
  const normalizedPv = pvMoves.map((m) => m.trim()).filter((m) => m.length > 0);
  if (normalizedPv.length === 0) {
    return { valid: false, reasonKey: 'position_editor.manual_pv_invalid_empty' };
  }
  if (normalizedPv.length % 2 === 0) {
    return { valid: false, reasonKey: 'position_editor.manual_pv_invalid_odd' };
  }

  let board: ShogiBoard;
  try {
    board = ShogiBoard.fromSfen(startSfen);
  } catch {
    return { valid: false, reasonKey: 'position_editor.manual_pv_invalid_illegal' };
  }

  const initialAttacker: Color = board.getTurn();
  const defender: Color = initialAttacker === 'b' ? 'w' : 'b';

  for (let i = 0; i < normalizedPv.length; i++) {
    const usi = normalizedPv[i]!;
    const activeSide: Color = board.getTurn();
    const legalMoves = getAllStrictLegalMoves(board, activeSide);
    if (!legalMoves.some((m) => m.usi === usi)) {
      return { valid: false, reasonKey: 'position_editor.manual_pv_invalid_illegal' };
    }

    const parsed = parseUsiMove(usi, board, board.getPly(), activeSide);
    if (!parsed) {
      return { valid: false, reasonKey: 'position_editor.manual_pv_invalid_illegal' };
    }

    const nextBoard = board.clone();
    nextBoard.applyMove(parsed);

    if (i % 2 === 0 && !isKingInCheck(nextBoard, defender)) {
      return { valid: false, reasonKey: 'position_editor.manual_pv_invalid_not_check' };
    }

    board = nextBoard;
  }

  const finalTurn = board.getTurn();
  const remainingEvasions = getAllStrictLegalMoves(board, finalTurn);
  if (remainingEvasions.length > 0) {
    return { valid: false, reasonKey: 'position_editor.manual_pv_invalid_not_mate' };
  }

  return {
    valid: true,
    matePly: normalizedPv.length,
    normalizedPv,
  };
}

/**
 * Extracts validated Tsumego problems from AI-analyzed KifuRecords
 * containing mate evaluations (`isMate: true`, odd `matePly` 1..15) with full PV.
 */
export function extractTsumegoFromKifuRecords(
  records: KifuRecord[]
): TsumegoProblem[] {
  const extracted: TsumegoProblem[] = [];
  const seenSfens = new Set<string>();
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  for (const rec of records) {
    if (!rec.evaluations || !rec.jkfJson || rec.jkfJson === '{}') continue;
    const evalEntries = Object.entries(rec.evaluations);
    if (evalEntries.length === 0) continue;

    let player: JKFPlayer;
    try {
      const parsedJkf: unknown = JSON.parse(rec.jkfJson);
      if (!parsedJkf || typeof parsedJkf !== 'object') continue;
      const kifuObj = parsedJkf as { moves?: unknown[] };
      if (Array.isArray(kifuObj.moves)) {
        cleanJkfFalsyPromotions(kifuObj.moves as never);
      }
      player = new JKFPlayer(parsedJkf as never);
    } catch {
      continue;
    }

    const maxPly = player.getMaxTesuu();
    evalEntries.sort((a, b) => Number(a[0]) - Number(b[0]));

    for (const [plyStr, ev] of evalEntries) {
      const ply = Number(plyStr);
      if (!Number.isInteger(ply) || ply < 0 || ply > maxPly) continue;
      if (
        ev.isMate !== true ||
        typeof ev.matePly !== 'number' ||
        ev.matePly < 1 ||
        ev.matePly > 15 ||
        ev.matePly % 2 === 0 ||
        !Array.isArray(ev.pv) ||
        ev.pv.length < ev.matePly
      ) {
        continue;
      }

      try {
        player.goto(ply);
      } catch {
        continue;
      }

      const startSfen = player.shogi.toSFENString();
      if (seenSfens.has(startSfen)) continue;

      const sideToMove: Color = player.shogi.turn === 0 ? 'b' : 'w';
      const isAttackerToMove =
        (sideToMove === 'b' && ev.scoreCp > 0) ||
        (sideToMove === 'w' && ev.scoreCp < 0);
      if (!isAttackerToMove) continue;

      const candidatePv = ev.pv.slice(0, ev.matePly);
      const validation = validateManualTsumegoPv(startSfen, candidatePv);
      if (!validation.valid || !validation.normalizedPv) continue;

      seenSfens.add(startSfen);
      extracted.push({
        id: `kifu-tsu-${rec.id}-${ply}`,
        source: 'kifu-extract',
        kind: 'attack',
        title: `${rec.title} (${ply}手目)`,
        startSfen,
        sideToMove,
        moveLimit: ev.matePly,
        solutionPv: validation.normalizedPv,
        acceptAllMatingMoves: true,
        tags: [`${ev.matePly}手詰`, '棋譜抽出'],
        provenance: {
          sourceGameId: rec.id,
          sourceGameTitle: rec.title,
          ply,
        },
        createdAt: nowMs,
        updatedAt: nowIso,
      });
    }
  }

  return extracted;
}

/**
 * Merges newly extracted Tsumego problems into the existing pool without
 * overwriting manual or previously saved problems sharing the same starting SFEN.
 */
export function mergeExtractedTsumegoProblems(
  existing: TsumegoProblem[],
  extracted: TsumegoProblem[]
): { merged: TsumegoProblem[]; added: TsumegoProblem[] } {
  const existingSfens = new Set(existing.map((p) => p.startSfen));
  const added: TsumegoProblem[] = [];

  for (const item of extracted) {
    if (existingSfens.has(item.startSfen)) continue;
    existingSfens.add(item.startSfen);
    added.push(item);
  }

  return {
    merged: [...existing, ...added],
    added,
  };
}
