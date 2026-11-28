/**
 * Opponent Threat Detection Utility (Issue #21).
 * Builds a legal turn-flipped SFEN (null-move check) so the engine can search
 * what the opponent would play immediately if the current player passed,
 * and formats the discovered threat move cleanly.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import type { Shogi } from 'shogi.js';
import { formatUsiToJapanese } from './usiFormatter';

export interface OpponentThreatInfo {
  sfen: string;
  usi: string;
  japaneseMove: string;
  opponentColor: 0 | 1;
  pv?: string[];
}

/**
 * Flips the side-to-move token in SFEN ('b' <-> 'w') for a null-move threat probe.
 * Returns null if the current side-to-move is already in check, since passing
 * while in check would produce an illegal position for USI engines.
 */
export function buildFlippedTurnSfen(
  shogi: { turn: 0 | 1; isCheck: (color: 0 | 1) => boolean },
  sfen: string
): string | null {
  const turn: 0 | 1 = shogi.turn === 1 ? 1 : 0;
  if (shogi.isCheck(turn)) {
    return null;
  }

  const trimmed = sfen.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return null;

  const nextTurn = parts[1] === 'w' ? 'b' : 'w';
  return [parts[0], nextTurn, ...parts.slice(2)].join(' ');
}

/**
 * Formats an opponent threat USI move in authentic Japanese notation.
 */
export function formatThreatUsiMove(
  usi: string,
  shogi: Shogi,
  opponentColor: 0 | 1
): string {
  return formatUsiToJapanese(usi, opponentColor, shogi);
}
