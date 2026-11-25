import { Color, ShogiMove } from './shogi';

export interface MatchRecord {
  id: string;
  userId: string;
  openingId: string;
  startedAt: string;
  endedAt: string;
  userColor: Color;
  startPly: number; // 0 for initial position, >0 for mid-game start
  startSfen: string;
  moves: ShogiMove[];
  outOfBookPly?: number; // Ply at which play diverged from opening tree
  result: 'win' | 'loss' | 'draw' | 'aborted';
  reason?: 'checkmate' | 'resignation' | 'timeout' | 'impasse';
  aiEngine: string; // e.g., "Fairy-Stockfish 14 Wasm"
  aiDepth: number;
  isMergedIntoTree: boolean; // True if this game was added to the repertoire
  hintsViewedCount?: number; // Number of times best move hint was revealed
}
