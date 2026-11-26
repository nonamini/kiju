/**
 * Japanese move formatting helpers for TacticalQuizCard lists and the interactive editor.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import { Shogi } from 'shogi.js';
import type { TacticalQuizCard } from '../types/quiz';
import type { Square } from '../types/shogi';
import { ShogiBoard } from './shogiBoard';
import { parseUsiMove } from './shogiRules';
import { formatUsiToJapanese } from './usiFormatter';

export interface FormattedUsiStep {
  usi: string;
  label: string;
  sfenAfter: string;
  lastMove: {
    from?: { x: number; y: number };
    to: { x: number; y: number };
  };
}

/**
 * Replays a card's setup USI moves from `startSfen` to obtain the quiz position SFEN.
 */
export function resolveQuizPositionSfen(
  card: Pick<TacticalQuizCard, 'startSfen' | 'usiMovesToPosition'>
): string {
  try {
    const board = ShogiBoard.fromSfen(card.startSfen);
    let prevTo: Square | undefined;
    for (let i = 0; i < card.usiMovesToPosition.length; i++) {
      const usi = card.usiMovesToPosition[i];
      if (!usi) continue;
      const parsed = parseUsiMove(usi, board, i + 1, board.getTurn(), prevTo);
      if (parsed) {
        board.applyMove(parsed);
        prevTo = parsed.to;
      }
    }
    return board.toSfen();
  } catch {
    return card.startSfen;
  }
}

/**
 * Formats a TacticalQuizCard's `bestMove` USI string into readable Japanese notation
 * (e.g. "▲５五角") using the resolved quiz board state.
 */
export function formatQuizBestMoveJapanese(
  card: Pick<TacticalQuizCard, 'startSfen' | 'usiMovesToPosition' | 'sideToMove' | 'bestMove'>
): string {
  if (!card.bestMove) return '';
  try {
    const sfen = resolveQuizPositionSfen(card);
    const shogi = new Shogi();
    shogi.initializeFromSFENString(sfen);
    const turnColor: 0 | 1 = card.sideToMove === 'w' ? 1 : 0;
    return formatUsiToJapanese(card.bestMove, turnColor, shogi) || card.bestMove;
  } catch {
    return card.bestMove;
  }
}

/**
 * Replays a sequence of USI moves from `baseSfen` and returns step-by-step
 * Japanese labels, resulting SFENs, and last-move coordinates.
 */
export function formatUsiLineFromSfen(
  baseSfen: string,
  usiLine: readonly string[],
  maxPlies: number = 6
): FormattedUsiStep[] {
  const steps: FormattedUsiStep[] = [];
  if (!baseSfen || usiLine.length === 0) return steps;

  try {
    const board = ShogiBoard.fromSfen(baseSfen);
    let prevTo: Square | undefined;

    for (let i = 0; i < usiLine.length && steps.length < maxPlies; i++) {
      const usi = usiLine[i];
      if (!usi) break;
      const curSfen = board.toSfen();
      const turn = board.getTurn();
      const turnColor: 0 | 1 = turn === 'w' ? 1 : 0;

      const shogi = new Shogi();
      shogi.initializeFromSFENString(curSfen);
      const label = formatUsiToJapanese(usi, turnColor, shogi) || usi;

      const parsed = parseUsiMove(usi, board, i + 1, turn, prevTo);
      if (!parsed) break;

      board.applyMove(parsed);
      prevTo = parsed.to;

      steps.push({
        usi,
        label,
        sfenAfter: board.toSfen(),
        lastMove: {
          from: parsed.from ? { x: parsed.from.file, y: parsed.from.rank } : undefined,
          to: { x: parsed.to.file, y: parsed.to.rank },
        },
      });
    }
  } catch {
    return steps;
  }

  return steps;
}
