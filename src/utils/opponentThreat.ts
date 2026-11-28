/**
 * Opponent Threat Detection Utility (Issue #21).
 * Builds a legal turn-flipped SFEN (null-move check) so the engine can search
 * what the opponent would play immediately if the current player passed,
 * and formats both the immediate threat and its short PV continuation cleanly.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import { Shogi } from 'shogi.js';
import type { PieceType } from '../types/shogi';
import { formatUsiToJapanese, parseUsiMove } from './usiFormatter';

export interface OpponentThreatInfo {
  sfen: string;
  usi: string;
  japaneseMove: string;
  opponentColor: 0 | 1;
  pv?: string[];
  pvJapanese?: string[];
}

/**
 * Flips the side-to-move token in SFEN ('b' <-> 'w') for a null-move threat probe.
 * Returns null if the current side-to-move is already in check, since passing
 * while in check would produce an illegal USI position.
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

/**
 * Simulates up to `maxMoves` PV moves from the flipped-turn SFEN so each ply
 * resolves its true piece kanji on the advancing board state.
 */
export function formatThreatPvMoves(
  pv: ReadonlyArray<string> | undefined,
  flippedSfen: string,
  maxMoves = 4
): string[] {
  if (!pv || pv.length === 0 || maxMoves <= 0) return [];

  const sim = new Shogi();
  try {
    sim.initializeFromSFENString(flippedSfen);
  } catch {
    return [];
  }

  const formatted: string[] = [];
  const limit = Math.min(pv.length, maxMoves);

  for (let i = 0; i < limit; i++) {
    const usi = pv[i];
    if (!usi) break;
    const simTurn: 0 | 1 = sim.turn === 1 ? 1 : 0;
    const jp = formatUsiToJapanese(usi, simTurn, sim);
    if (!jp) break;
    formatted.push(jp);

    if (i + 1 >= limit) break;
    const parsed = parseUsiMove(usi, sim);
    if (!parsed) break;
    try {
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
    } catch {
      break;
    }
  }

  return formatted;
}
