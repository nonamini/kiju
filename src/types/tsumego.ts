/**
 * Tsumego (詰将棋 / 詰めろ逃れ) Data Models & Type Definitions.
 *
 * Implements the specifications outlined in docs/spec/tsumego.md.
 * Supports N-move checkmate problems (attack) and mating-threat escapes (defense).
 *
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import { Color } from './shogi';

/** Kind of tsumego problem */
export type TsumegoKind = 'attack' | 'defense';
// attack  = solver delivers checkmate (N手詰)
// defense = solver escapes a mating threat (受け・逃れ)

/** Origin source of the problem */
export type TsumegoSource =
  | 'kifu-extract'   // auto-extracted from game records / sparring
  | 'manual'         // hand-entered problem (KIF text or form)
  | 'preset'         // built-in curated classic / training problem
  | 'tanuki-import'  // imported from tanuki-tsume-shogi puzzle JSON
  | 'generated';     // future: auto-generated problems

/** Provenance data for problems extracted from actual games */
export interface TsumegoGameProvenance {
  sourceGameId: string;
  sourceGameTitle?: string;
  ply: number;
}

/** Tsumego problem definition */
export interface TsumegoProblem {
  id: string;
  title?: string;
  source: TsumegoSource;
  kind: TsumegoKind;
  startSfen: string;              // starting board state (SFEN)
  sideToMove: Color;              // solver's color ('b' for sente, 'w' for gote)
  moveLimit: number;              // plies count (e.g. 1 for 1手詰, 3 for 3手詰)
  solutionPv: string[];           // main line sequence in USI format (e.g. ['2g2f', '2c2d'])
  acceptAllMatingMoves?: boolean; // if true, any move that preserves checkmate within limit is correct
  tags: string[];                 // e.g. ['1手詰', '銀', 'ただ捨て', '基本']
  importSourceName?: string;      // normalized filename stem when imported from SFEN/KIF
  provenance?: TsumegoGameProvenance;
  createdAt: number;
  updatedAt?: string;              // ISO 8601
  lastReviewedAt?: number;
}

/** User's solving attempt result */
export interface TsumegoAttemptResult {
  problemId: string;
  solved: boolean;
  movesCount: number;
  hintsUsed: number;
  elapsedMs: number;
  timestamp: number;
}
