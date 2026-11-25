import { KifuAnalysisStatus } from './kifuRecord';
import { Color, MoveEvaluation, ShogiMove } from './shogi';

export interface KifuTreeNode {
  id: string; // Unique node hash (e.g., SFEN + move)
  sfen: string; // Board position after this move
  move: ShogiMove; // The move that led to this position
  comment: string; // Formatted comment lines
  evaluation?: MoveEvaluation; // Attached engine analysis
  gameCount: number; // Number of ingested games adopting this move
  wins: {
    sente: number;
    gote: number;
    draw: number;
  };
  gameRefs: Array<{
    gameId: string;
    title: string;
    date: string;
    winner: Color | 'draw';
  }>;
  children: KifuTreeNode[]; // Branches / subsequent variations
  isMainline: boolean; // True if chosen as the primary branch
}

export interface MergedKifuTree {
  openingId: string; // e.g., 'kakugawari'
  openingName: string; // e.g., 'Bishop Exchange'
  rootSfen: string; // Typically standard initial SFEN "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"
  rootNodes: KifuTreeNode[]; // Moves from move 1
  totalGames: number;
  updatedAt: string; // ISO 8601
}

export interface IngestedGame {
  id: string; // UUID or content SHA-256
  userId: string; // Firebase Auth UID
  openingId: string; // Category identifier
  title: string; // e.g., "2023-10-15_Fujii_Ito_Ryuo"
  date?: string; // YYYY-MM-DD
  senteName: string; // Player name (Black)
  goteName: string; // Player name (White)
  tournament?: string; // Tournament / Event name
  winner?: Color | 'draw' | 'unknown';
  plyCount: number;
  rawKif: string; // Original KIF string
  isIncluded: boolean; // Whether to include in merged tree
  isAnalyzed: boolean; // Whether engine analysis has been run
  analysisStatus?: KifuAnalysisStatus;
  analysisEngineId?: string;
  createdAt: string;
  updatedAt: string;
}
