/**
 * Game Evaluation & Insight Engine Types.
 * Matches specifications in docs/spec/game_evaluation.md.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import { Color } from './shogi';

export type QualityLevel =
  | 'AI_FLAG'
  | 'LV_5A'
  | 'LV_5B'
  | 'LV_5C'
  | 'LV_4'
  | 'LV_3'
  | 'LV_2'
  | 'LV_1';

export type MatchPattern =
  | 'WIRE_TO_WIRE'
  | 'COMEBACK'
  | 'SEESAW'
  | 'CRUSH';

export interface MoveAnalysisInput {
  ply: number;
  turn: Color;
  playedMove: string;     // USI (e.g., '7g7f')
  bestMove: string;       // USI
  bestScore: number;     // Sente POV (cp)
  playedScore: number;   // Sente POV (cp)
  secondScore?: number;  // Sente POV (cp)
  isBookMove?: boolean;
}

export interface MatchMetrics {
  effectiveMoves: number;
  acl: number;
  meanWinRateLoss?: number; // Mean win-rate drop per effective move (0-100 scale)
  criticalAccuracy: number;
  blunderCount: number;
  mistakeCount: number;
  inaccuracyCount: number;
  reversalCount: number;
  evenPliesCount: number; // Number of plies where tension remained even (|score| <= 200cp)
  evenTensionRate: number; // Percentage (0-100) of plies within even tension
}

export interface RadarChartScores {
  opening: number;    // 序盤力 (0-100)
  midgame: number;    // 中盤力 (0-100)
  endgame: number;    // 終盤力 (0-100)
  stability: number;  // 安定度 (0-100)
  tactics: number;    // 勝負強さ・急所 (0-100)
}

export interface PlayerInsight {
  color: Color;
  level: QualityLevel;
  isWinner: boolean;
  metrics: MatchMetrics;
  radarChart: RadarChartScores;
  pattern: MatchPattern;
  summaryComment: string;
}

export interface GameEvaluationResult {
  matchId?: string;
  overallLevel: QualityLevel;
  black: PlayerInsight;
  white: PlayerInsight;
  analyzedAt: string; // ISO 8601
}
