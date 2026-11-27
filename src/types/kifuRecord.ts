/**
 * Unified Kifu Record domain model.
 * Consolidates the legacy SavedStudioGame (studioKifuStorage) and
 * IngestedGame/GameMergeInput (ingestedGamesStorage) into a single entity
 * shared by Studio study mode and Tree repertoire building.
 * Spec: docs/spec/kifu_management_enhancement.md, docs/spec/data_models.md §7.
 * Follows Rule 1: strictly English code, comments, and identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import { MoveEvaluation } from './shogi';
import { ForkPointer } from 'json-kifu-format';
import { MatchPattern, QualityLevel, RadarChartScores } from './evaluation';

export interface KifuSideEvaluationSummary {
  level: QualityLevel;
  isWinner: boolean;
  meanWinRateLoss: number;
  acl: number;
  criticalAccuracy: number;
  blunderCount: number;
  mistakeCount: number;
  inaccuracyCount: number;
  radarChart: RadarChartScores;
  pattern: MatchPattern;
}

export interface KifuEvaluationSummary {
  overallLevel: QualityLevel;
  black: KifuSideEvaluationSummary;
  white: KifuSideEvaluationSummary;
}

export type KifuRecordSource = 'studio' | 'tree' | 'import';

export type KifuWinner = 'sente' | 'gote' | 'draw' | 'unknown';

export type KifuGameKind = 'pro' | 'ladies' | 'amateur' | 'self' | 'joseki' | 'other';

export type KifuReviewStatus = 'unread' | 'read' | 'needs_review';

/**
 * Lightweight mainline move summary (up to ~30 plies) stored inside metadata
 * so JosekiTreeVisualizer can build the opening tree without loading full
 * jkfJson payloads.
 */
export interface KifuOpeningMove {
  usi: string;
  japaneseMove: string;
  sfen: string;
}

/**
 * Cloud/local analysis job lifecycle.
 * - 'analyzing': legacy in-progress flag used by local Wasm batch analysis.
 * - 'queued'/'processing': cloud worker claim states (Issue #59).
 */
export type CloudAnalysisLevel = 'light' | 'standard' | 'deep';

export const CLOUD_ANALYSIS_LEVEL_NODES: Record<CloudAnalysisLevel, number> = {
  light: 100000,
  standard: 200000,
  deep: 500000,
};

export type KifuAnalysisStatus =
  | 'unanalyzed'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'analyzing';

export interface KifuRecord {
  // === Identity & basics ===
  id: string; // UUID
  title: string;
  contentHash: string; // Normalized kifu SHA-256 (dedup key, computed in Issue #40)
  source: KifuRecordSource;

  // === Game metadata ===
  senteName: string;
  goteName: string;
  sentePlayerId?: string; // ShogiPlayerProfile.id
  gotePlayerId?: string;
  matchDate?: string; // ISO 8601 date (YYYY-MM-DD)
  tournament?: string;
  openingId: string; // OPENING_CATEGORIES.id
  openingName: string;
  winner?: KifuWinner;
  totalPlies: number;

  // === Kifu payload ===
  jkfJson: string; // JSONKifuFormat serialized tree
  rawKif?: string; // Optional raw KIF text

  // === Classification & meta ===
  tags: string[];
  /** Canonical tag definition IDs (Issue #64); `tags` is the derived name cache. */
  tagIds?: string[];
  /** Game classification (Issue #71 / #139): pro / ladies / amateur / self / other. */
  gameKind?: KifuGameKind;
  /** Optional virtual folder hierarchy path (e.g. "研究/角換わり/腰掛け銀", Issue #9). */
  folderPath?: string;
  notes?: string;
  favorite?: boolean;
  reviewStatus?: KifuReviewStatus;

  // === Analysis ===
  evaluations?: Record<number, MoveEvaluation>;
  analysisEngineId?: string;
  analysisDepth?: number;
  analysisStatus?: KifuAnalysisStatus;
  analyzedPliesCount?: number;
  analysisJobId?: string; // Worker claim token (cloud pipeline)
  analysisClaimedAt?: string; // ISO 8601
  analysisError?: string;
  /** Position SFEN list generated at queue time (cloud pipeline, #59).
   *  Index i = position after i plies (0 = initial). Cleared by the worker
   *  after successful analysis; retained on failure for retry. */
  positionSfens?: string[];
  /** 1-based queue position among 'queued' records, maintained by the
   *  cloud worker after each completed game. */
  analysisQueuePosition?: number;
  /** Target USI nodes per ply requested for cloud analysis (Issue #59). */
  analysisTargetNodes?: number;
  /** Forces the cloud worker to re-evaluate all plies even if previously
   *  completed by yaneuraou (cleared by the worker after run). */
  analysisForceReanalyze?: boolean;
  /** Compact per-side AI evaluation summary cached on metadata (#58b). */
  evaluationSummary?: KifuEvaluationSummary;

  // === Tree integration ===
  isIncludedInTree: boolean; // Whether this kifu participates in tree merging
  activeForkPointers?: ForkPointer[]; // Last selected branch path
  /** Pre-extracted mainline opening moves (up to 30 plies) for JosekiTreeVisualizer. */
  openingLine?: KifuOpeningMove[];

  // === Audit / migration ===
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  deletedAt?: string; // ISO 8601 when moved to trash
  originStudioGameId?: string; // Migration source: SavedStudioGame.id
  originIngestedGameId?: string; // Migration source: IngestedGame.id
}
