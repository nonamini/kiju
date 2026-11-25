/**
 * Fairy-Stockfish USI/UCI Protocol Parser.
 * Parses engine stdout stream lines into structured search info and move data.
 * Follows Rule 1: strictly English code, comments, and identifiers.
 */

import { EngineSearchInfo } from './types';
import { Color } from '../types/shogi';

/**
 * Parses an engine "info" line into an EngineSearchInfo object.
 *
 * Example:
 * "info depth 6 seldepth 6 multipv 1 score cp 100 nodes 1288 nps 12384 time 104 pv 7i7h 8b4b"
 * "info depth 5 score mate 3 nodes 50 time 12 pv G*5b"
 *
 * @param line Single stdout line from Fairy-Stockfish
 * @param sideToMove Current side to move ('b' for Sente, 'w' for Gote)
 */
export function parseEngineInfoLine(
  line: string,
  sideToMove: Color = 'b'
): EngineSearchInfo | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('info ') && trimmed !== 'info') {
    return null;
  }

  const tokens = trimmed.split(/\s+/);
  let depth = 0;
  let seldepth: number | undefined;
  let scoreCp: number | undefined;
  let isMate: boolean | undefined;
  let matePly: number | undefined;
  let nodes: number | undefined;
  let nps: number | undefined;
  let timeMs: number | undefined;
  let multipv: number | undefined;
  const pv: string[] = [];

  let inPv = false;

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    if (inPv) {
      pv.push(token);
      continue;
    }

    if (token === 'depth' && i + 1 < tokens.length) {
      depth = parseInt(tokens[++i] ?? '0', 10);
    } else if (token === 'seldepth' && i + 1 < tokens.length) {
      seldepth = parseInt(tokens[++i] ?? '0', 10);
    } else if (token === 'multipv' && i + 1 < tokens.length) {
      multipv = parseInt(tokens[++i] ?? '1', 10);
    } else if (token === 'nodes' && i + 1 < tokens.length) {
      nodes = parseInt(tokens[++i] ?? '0', 10);
    } else if (token === 'nps' && i + 1 < tokens.length) {
      nps = parseInt(tokens[++i] ?? '0', 10);
    } else if (token === 'time' && i + 1 < tokens.length) {
      timeMs = parseInt(tokens[++i] ?? '0', 10);
    } else if (token === 'score' && i + 2 < tokens.length) {
      const scoreType = tokens[++i];
      const scoreVal = parseInt(tokens[++i] ?? '0', 10);

      if (scoreType === 'cp') {
        // UCI standard: score is relative to side to move.
        // Normalize to Sente positive (+), Gote negative (-):
        scoreCp = sideToMove === 'w' ? -scoreVal : scoreVal;
      } else if (scoreType === 'mate') {
        isMate = true;
        matePly = Math.abs(scoreVal);
        // If scoreVal === 0, the side to move is already checkmated!
        // When sideToMove === 'w' (Gote) is mated, Sente won (+30000).
        // When sideToMove === 'b' (Sente) is mated, Gote won (-30000).
        // When scoreVal > 0, the side to move delivers mate.
        // When scoreVal < 0, the side to move gets mated.
        let isSenteMating = false;
        if (scoreVal === 0) {
          isSenteMating = sideToMove === 'w';
        } else if (sideToMove === 'b') {
          isSenteMating = scoreVal > 0;
        } else {
          isSenteMating = scoreVal < 0;
        }
        scoreCp = isSenteMating ? 30000 : -30000;
      }
    } else if (token === 'pv') {
      inPv = true;
    }
  }

  // Only return valid info if at least depth or pv is present
  if (depth === 0 && pv.length === 0 && scoreCp === undefined) {
    return null;
  }

  return {
    depth,
    seldepth,
    scoreCp,
    isMate,
    matePly,
    nodes,
    nps,
    timeMs,
    multipv,
    pv: pv.length > 0 ? pv : undefined,
    bestMove: pv[0],
    rawLine: trimmed,
  };
}

/**
 * Parses an engine "bestmove" line.
 *
 * Example:
 * "bestmove 7i7h ponder 8b4b"
 * "bestmove resign"
 * "bestmove (none)"
 */
export function parseEngineBestMoveLine(
  line: string
): { bestMove: string; ponder?: string } | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('bestmove')) {
    return null;
  }

  const parts = trimmed.split(/\s+/);
  const bestMove = parts[1];
  if (!bestMove) return null;

  let ponder: string | undefined;
  const ponderIndex = parts.indexOf('ponder');
  if (ponderIndex !== -1 && parts[ponderIndex + 1]) {
    ponder = parts[ponderIndex + 1];
  }

  return {
    bestMove,
    ponder,
  };
}

/**
 * Formats USI position command.
 */
export function formatPositionCommand(sfen?: string, moves?: string[]): string {
  let cmd: string;
  if (!sfen || sfen === 'startpos') {
    cmd = 'position startpos';
  } else {
    cmd = `position sfen ${sfen}`;
  }

  if (moves && moves.length > 0) {
    cmd += ` moves ${moves.join(' ')}`;
  }

  return cmd;
}

/**
 * Formats USI go search command.
 */
export function formatGoCommand(options: {
  depth?: number;
  movetime?: number;
  byoyomi?: number;
  btime?: number;
  wtime?: number;
}): string {
  const tokens = ['go'];

  if (options.depth !== undefined && options.depth > 0) {
    tokens.push(`depth ${options.depth}`);
  } else if (options.movetime !== undefined && options.movetime > 0) {
    tokens.push(`movetime ${options.movetime}`);
  } else if (options.byoyomi !== undefined && options.byoyomi > 0) {
    tokens.push(`byoyomi ${options.byoyomi}`);
  } else {
    // Default safe fallback search bounds
    tokens.push('depth 8');
  }

  if (options.btime !== undefined && options.btime > 0) {
    tokens.push(`btime ${options.btime}`);
  }
  if (options.wtime !== undefined && options.wtime > 0) {
    tokens.push(`wtime ${options.wtime}`);
  }

  return tokens.join(' ');
}
