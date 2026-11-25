/**
 * Weakness Drill & Position Types.
 * Aggregates recurring divergence points and losses from sparring history
 * into focused drill decks.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import { Color } from './shogi';

export interface WeaknessPosition {
  id: string; // Unique identifier: `${openingId}:${ply}:${playedMoveUsi}`
  openingId: string;
  openingName?: string;
  ply: number; // Ply at which divergence or mistake occurred
  sfen: string; // Board SFEN at the weakness position
  usiMovesToPosition: string[]; // USI move sequence from game start to this position
  playerColor: Color; // Side to move for the user
  lossCount: number; // Total losses originating from or passing through this position
  matchCount: number; // Total matches reaching this position
  lastLossAt: string; // ISO 8601 date of the most recent loss
  playedMoveUsi: string; // The move played by the user (divergence / blunder)
  bookMovesUsi: string[]; // Correct book candidate moves according to the repertoire tree
  sourceMatchIds: string[]; // IDs of the matches associated with this weakness
}
