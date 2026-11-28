/**
 * Blunder Refutation Classifier & 3-Stage Progressive Hint Utility (Issue #22).
 * Detects sudden evaluation drops after a move, classifies tactical causes
 * (forced mate, check fork, free capture, fork, or general loss),
 * formats 1-3 move refutation lines, and generates 3-stage hints.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import { Shogi } from 'shogi.js';
import type { MoveEvaluation, PieceType } from '../types/shogi';
import { computeBoardAssistMap } from './boardAssistOverlay';
import { formatThreatPvMoves } from './opponentThreat';
import { formatUsiToJapanese, parseUsiMove } from './usiFormatter';

export type BlunderReasonCode =
  | 'mate_allowed'
  | 'mate_missed'
  | 'check_fork'
  | 'free_capture'
  | 'fork'
  | 'eval_drop';

export interface BlunderWarningInfo {
  ply: number;
  sfen: string;
  cpDrop: number;
  reason: BlunderReasonCode;
  refutationUsi: string;
  refutationJapanese: string;
  refutationPvJapanese: string[];
}

export type ProgressiveHintStage = 0 | 1 | 2 | 3;

export interface ProgressiveHintResult {
  stage: 1 | 2 | 3;
  highlightSquares: Array<{ x: number; y: number }>;
  isDrop: boolean;
  dropPieceKind?: string;
  japaneseMove?: string;
}

const VALUABLE_FORK_TARGETS: ReadonlySet<string> = new Set([
  'HI',
  'RY',
  'KA',
  'UM',
  'KI',
  'GI',
]);

const MAJOR_PIECE_KINDS: ReadonlySet<string> = new Set([
  'HI',
  'RY',
  'KA',
  'UM',
]);

function normalizeEvalForColor(ev: MoveEvaluation, color: 0 | 1): number {
  return color === 0 ? ev.scoreCp : -ev.scoreCp;
}

function detectTacticalRefutationReason(
  sfen: string,
  refutationUsi: string,
  moverColor: 0 | 1,
  prevEval: MoveEvaluation,
  curEval: MoveEvaluation
): BlunderReasonCode {
  const prevScore = normalizeEvalForColor(prevEval, moverColor);
  const curScore = normalizeEvalForColor(curEval, moverColor);

  if (curEval.isMate && curScore < 0) {
    return 'mate_allowed';
  }
  if (prevEval.isMate && prevScore > 0 && !curEval.isMate) {
    return 'mate_missed';
  }

  const parsed = parseUsiMove(refutationUsi);
  if (!parsed) return 'eval_drop';

  const sim = new Shogi();
  try {
    sim.initializeFromSFENString(sfen);
    const destBefore = sim.get(parsed.to.x, parsed.to.y);
    const capturedMoverPiece =
      destBefore && destBefore.color === moverColor ? destBefore.kind : null;

    if (parsed.from) {
      sim.move(
        parsed.from.x,
        parsed.from.y,
        parsed.to.x,
        parsed.to.y,
        Boolean(parsed.promote)
      );
    } else {
      sim.drop(parsed.to.x, parsed.to.y, parsed.piece as PieceType);
    }

    const oppColor: 0 | 1 = moverColor === 0 ? 1 : 0;
    const isGivingCheck = sim.isCheck(moverColor);

    // Inspect squares attacked by the newly moved/dropped piece
    const attackedMoves = sim.getMovesFrom(parsed.to.x, parsed.to.y);
    const valuableTargets: Array<{ x: number; y: number }> = [];
    for (const m of attackedMoves) {
      const targetPiece = sim.get(m.to.x, m.to.y);
      if (
        targetPiece &&
        targetPiece.color === moverColor &&
        VALUABLE_FORK_TARGETS.has(targetPiece.kind)
      ) {
        valuableTargets.push({ x: m.to.x, y: m.to.y });
      }
    }

    if (isGivingCheck && valuableTargets.length >= 1) {
      return 'check_fork';
    }

    if (capturedMoverPiece) {
      const assistMap = computeBoardAssistMap(sim, moverColor);
      const destAssist = assistMap.find(
        (sq) => sq.x === parsed.to.x && sq.y === parsed.to.y
      );
      const moverDefenders = destAssist?.ownAttacks ?? 0;
      const oppAttackers = oppColor === 0 ? (destAssist?.senteAttacks ?? 0) : (destAssist?.goteAttacks ?? 0);
      if (
        moverDefenders === 0 ||
        (MAJOR_PIECE_KINDS.has(capturedMoverPiece) && oppAttackers >= moverDefenders)
      ) {
        return 'free_capture';
      }
    }

    if (valuableTargets.length >= 2) {
      return 'fork';
    }
  } catch {
    return 'eval_drop';
  }

  return 'eval_drop';
}

/**
 * Classifies whether the move leading to `sfen` represents a significant blunder
 * from `moverColor`'s perspective and returns refutation details.
 */
export function classifyBlunder(params: {
  shogi: Shogi;
  sfen: string;
  ply: number;
  moverColor: 0 | 1;
  prevEval: MoveEvaluation;
  curEval: MoveEvaluation;
  thresholdCp?: number;
}): BlunderWarningInfo | null {
  const { shogi, sfen, ply, moverColor, prevEval, curEval, thresholdCp = 350 } = params;
  if (ply <= 0) return null;

  const prevScore = normalizeEvalForColor(prevEval, moverColor);
  const curScore = normalizeEvalForColor(curEval, moverColor);
  const cpDrop = prevScore - curScore;
  if (cpDrop < thresholdCp) return null;

  const refutationUsi = curEval.bestMove ?? curEval.pv?.[0];
  if (!refutationUsi || refutationUsi === 'resign' || refutationUsi === 'win') {
    return null;
  }

  const oppColor: 0 | 1 = moverColor === 0 ? 1 : 0;
  const reason = detectTacticalRefutationReason(
    sfen,
    refutationUsi,
    moverColor,
    prevEval,
    curEval
  );
  const refutationJapanese = formatUsiToJapanese(refutationUsi, oppColor, shogi);
  const pvSource =
    curEval.pv && curEval.pv.length > 0 ? curEval.pv : [refutationUsi];
  const refutationPvJapanese = formatThreatPvMoves(pvSource, sfen, 3);

  return {
    ply,
    sfen,
    cpDrop: Math.round(cpDrop),
    reason,
    refutationUsi,
    refutationJapanese,
    refutationPvJapanese:
      refutationPvJapanese.length > 0 ? refutationPvJapanese : [refutationJapanese],
  };
}

/**
 * Builds board highlights and reveal details for progressive hint stages 1..3:
 * - Stage 1: only highlight the piece to move (or identify piece kind if a drop)
 * - Stage 2: highlight both origin and destination squares (direction / target)
 * - Stage 3: include the full Japanese move string
 */
export function buildProgressiveHint(
  bestUsi: string | undefined,
  shogi: Shogi,
  stage: 1 | 2 | 3
): ProgressiveHintResult | null {
  if (!bestUsi || bestUsi === 'resign' || bestUsi === 'win') return null;
  const parsed = parseUsiMove(bestUsi, shogi);
  if (!parsed) return null;

  const isDrop = !parsed.from;
  if (stage === 1) {
    return {
      stage: 1,
      highlightSquares: parsed.from ? [parsed.from] : [],
      isDrop,
      dropPieceKind: isDrop ? parsed.piece : undefined,
    };
  }

  const highlightSquares = parsed.from ? [parsed.from, parsed.to] : [parsed.to];
  if (stage === 2) {
    return {
      stage: 2,
      highlightSquares,
      isDrop,
      dropPieceKind: isDrop ? parsed.piece : undefined,
    };
  }

  const turnColor: 0 | 1 = shogi.turn === 1 ? 1 : 0;
  return {
    stage: 3,
    highlightSquares,
    isDrop,
    dropPieceKind: isDrop ? parsed.piece : undefined,
    japaneseMove: formatUsiToJapanese(bestUsi, turnColor, shogi),
  };
}
