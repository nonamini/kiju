import { ShogiMove } from './shogi';

export interface SRSReviewCard {
  id: string; // Unique card ID (e.g., openingId + sfen)
  userId: string;
  openingId: string;
  sfen: string; // Current position to test
  correctMove: ShogiMove; // Target correct move
  alternativeMoves?: ShogiMove[]; // Allowed alternative variations

  // SM-2 Spaced Repetition Parameters
  intervalDays: number; // Current repetition interval in days
  repetitionCount: number; // Consecutive successful reviews
  easeFactor: number; // Multiplier (defaults to 2.5)
  dueDate: string; // Next scheduled review (YYYY-MM-DD)

  // Historical Performance
  totalAttempts: number;
  mistakes: number;
  hintsUsedCount: number;
  lastReviewedAt?: string;
}

export type HintType =
  | 'rank' // Rank position (ranks 1-5 vs 6-9)
  | 'file' // File position (files 1-3, 4-6, 7-9)
  | 'piece' // Piece type used (FU, GI, etc.)
  | 'boardOrHand' // Board piece move vs Hand piece drop
  | 'answer'; // Show answer coordinates
