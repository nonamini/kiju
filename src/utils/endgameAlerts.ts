/**
 * Endgame Safety & Mate Alert Detector (Issue #23).
 * Detects own-King Tsumero (passing allows forced mate) / Hisshi (forced mate even
 * with best defense) and spoiler-free opponent-King mate / decisive opportunity
 * notifications, leaving the mating sequence hidden unless explicitly requested.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import type { MoveEvaluation } from '../types/shogi';

export type EndgameAlertKind =
  | 'enemy_mate'
  | 'own_hisshi'
  | 'own_tsumero'
  | 'enemy_decisive';

export interface EndgameAlert {
  kind: EndgameAlertKind;
  turnColor: 0 | 1;
  matePly?: number;
  spoilerPv?: string[];
}

function normalizeScore(ev: MoveEvaluation, color: 0 | 1): number {
  return color === 0 ? ev.scoreCp : -ev.scoreCp;
}

/**
 * Evaluates current-position and null-move evaluations from `turnColor`'s perspective
 * to surface endgame safety warnings and spoiler-free winning alerts.
 */
export function detectEndgameAlerts(params: {
  turnColor: 0 | 1;
  curEval?: MoveEvaluation | null;
  nullMoveEval?: MoveEvaluation | null;
}): EndgameAlert[] {
  const { turnColor, curEval, nullMoveEval } = params;
  const alerts: EndgameAlert[] = [];

  const curScore = curEval ? normalizeScore(curEval, turnColor) : 0;
  const nullScore = nullMoveEval ? normalizeScore(nullMoveEval, turnColor) : 0;

  const hasEnemyMate = Boolean(curEval?.isMate && curScore > 0);
  const hasOwnHisshi = Boolean(curEval?.isMate && curScore < 0);

  if (hasEnemyMate && curEval) {
    alerts.push({
      kind: 'enemy_mate',
      turnColor,
      matePly: curEval.matePly,
      spoilerPv: curEval.pv && curEval.pv.length > 0 ? curEval.pv : curEval.bestMove ? [curEval.bestMove] : undefined,
    });
  }

  if (hasOwnHisshi) {
    alerts.push({
      kind: 'own_hisshi',
      turnColor,
      matePly: curEval?.matePly,
    });
  } else if (nullMoveEval?.isMate && nullScore < 0) {
    // Passing allows opponent forced mate while a legal defense still avoids mate
    alerts.push({
      kind: 'own_tsumero',
      turnColor,
      matePly: nullMoveEval.matePly,
    });
  }

  if (!hasEnemyMate && curEval && !curEval.isMate && curScore >= 2500) {
    alerts.push({
      kind: 'enemy_decisive',
      turnColor,
    });
  }

  return alerts;
}
