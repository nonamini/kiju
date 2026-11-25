/**
 * Bidirectional codec between unified KifuRecord and the legacy view types
 * (SavedStudioGame / IngestedGame / GameMergeInput).
 * All field-lossy conversions are centralized here so adapters (#42c/#42d)
 * and migrations (#41/#42b) share one tested mapping layer.
 * Spec: docs/tasks/task_breakdown.md Issue #42a.
 * Follows Rule 1: strictly English code, comments, and identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import { Formats, Parsers } from 'json-kifu-format';
import type {
  KifuAnalysisStatus,
  KifuGameKind,
  KifuRecord,
  KifuWinner,
} from '../types/kifuRecord';
import type { IngestedGame } from '../types/tree';
import type { MoveEvaluation, ShogiMove } from '../types/shogi';
import type { SavedStudioGame } from './studioKifuStorage';
import type { GameMergeInput } from './treeMerger';
import { inferGameKind } from './gameKindClassifier';
import { DEFAULT_APP_USER_ID } from './playerStorage';
import { computeKifuRecordContentHash } from './kifuContentHash';
import { OPENING_CATEGORIES } from './openingClassifier';
import i18n from '../locales/i18n';

// ---------------------------------------------------------------------------
// Analysis status mapping (KifuRecord 6-state <-> legacy 3-state / boolean)
// ---------------------------------------------------------------------------

const STUDIO_STATUS_TO_RECORD: Record<
  NonNullable<SavedStudioGame['analysisStatus']>,
  KifuAnalysisStatus
> = {
  unanalyzed: 'unanalyzed',
  analyzing: 'analyzing',
  completed: 'completed',
};

const RECORD_STATUS_TO_STUDIO: Record<
  KifuAnalysisStatus,
  NonNullable<SavedStudioGame['analysisStatus']>
> = {
  unanalyzed: 'unanalyzed',
  queued: 'analyzing',
  processing: 'analyzing',
  completed: 'completed',
  failed: 'unanalyzed',
  analyzing: 'analyzing',
};

// ---------------------------------------------------------------------------
// Winner mapping (KifuWinner <-> IngestedGame Color|'draw'|'unknown')
// ---------------------------------------------------------------------------

function winnerToIngested(winner: KifuWinner | undefined): IngestedGame['winner'] {
  if (winner === 'sente') return 'b';
  if (winner === 'gote') return 'w';
  if (winner === 'draw') return 'draw';
  return 'unknown';
}

function winnerFromIngested(winner: IngestedGame['winner']): KifuWinner {
  if (winner === 'b') return 'sente';
  if (winner === 'w') return 'gote';
  if (winner === 'draw') return 'draw';
  return 'unknown';
}

/**
 * Resolves a display name for an openingId via i18n, falling back to the id.
 */
export function resolveOpeningName(openingId: string): string {
  const category = OPENING_CATEGORIES.find((c) => c.id === openingId);
  if (!category) return openingId;
  const translated = i18n.t(category.nameKey);
  return translated && translated !== category.nameKey ? translated : openingId;
}

// ---------------------------------------------------------------------------
// JKF helpers
// ---------------------------------------------------------------------------

/**
 * Parses raw KIF text into a JSONKifuFormat string for KifuRecord.jkfJson.
 * Returns '{}' when parsing fails so rawKif remains the source of truth.
 */
export function rawKifToJkfJson(rawKif: string | undefined): string {
  if (!rawKif) return '{}';
  try {
    const jkf: Formats.JSONKifuFormat = Parsers.parseKIF(rawKif);
    return JSON.stringify(jkf);
  } catch {
    return '{}';
  }
}

/**
 * Counts branch points (MoveFormat nodes that own fork streams) in a JKF JSON string.
 * Used to reconstruct SavedStudioGame.forkCount for the studio view.
 */
export function countForkPointsInJkfJson(jkfJson: string | undefined): number {
  if (!jkfJson) return 0;
  try {
    const parsed = JSON.parse(jkfJson) as Formats.JSONKifuFormat;
    return countForksInMoves(parsed.moves ?? []);
  } catch {
    return 0;
  }
}

function countForksInMoves(moves: Formats.MoveFormat[]): number {
  let count = 0;
  for (const mf of moves) {
    if (mf.forks && mf.forks.length > 0) {
      count++;
      for (const forkStream of mf.forks) {
        count += countForksInMoves(forkStream);
      }
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Evaluation <-> moves rehydration
// ---------------------------------------------------------------------------

/**
 * Extracts per-ply evaluations from parsed moves into the KifuRecord
 * `evaluations` map shape (ply -> MoveEvaluation).
 */
export function movesEvaluationToRecordMap(
  moves: ShogiMove[] | undefined
): Record<number, MoveEvaluation> | undefined {
  if (!moves || moves.length === 0) return undefined;
  const map: Record<number, MoveEvaluation> = {};
  for (const m of moves) {
    if (m.evaluation) map[m.ply] = m.evaluation;
  }
  return Object.keys(map).length > 0 ? map : undefined;
}

/**
 * Re-injects record evaluations onto parsed moves by ply number.
 * Returns moves unchanged when no evaluations are provided.
 */
export function applyRecordEvaluationsToMoves<T extends { ply: number; evaluation?: MoveEvaluation }>(
  moves: T[],
  evaluations?: Record<number, MoveEvaluation>
): T[] {
  if (!evaluations) return moves;
  return moves.map((m) => {
    const evalObj = evaluations[m.ply];
    if (!evalObj) return m;
    return { ...m, evaluation: evalObj };
  });
}

// ---------------------------------------------------------------------------
// Studio view conversions (KifuRecord <-> SavedStudioGame)
// ---------------------------------------------------------------------------

/**
 * Projects a KifuRecord into the legacy SavedStudioGame view shape.
 * forkCount is recomputed from the JKF fork structure.
 */
export function kifuRecordToStudioGame(rec: KifuRecord): SavedStudioGame {
  return {
    id: rec.id,
    title: rec.title,
    senteName: rec.senteName,
    goteName: rec.goteName,
    sentePlayerId: rec.sentePlayerId,
    gotePlayerId: rec.gotePlayerId,
    winner: rec.winner,
    gameKind: rec.gameKind ?? inferGameKind(rec),
    openingId: rec.openingId,
    openingName: rec.openingName,
    totalPlies: rec.totalPlies,
    forkCount: countForkPointsInJkfJson(rec.jkfJson),
    rawKif: rec.rawKif,
    jkfJson: rec.jkfJson,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    matchDate: rec.matchDate,
    tournament: rec.tournament,
    tags: rec.tags ?? [],
    evaluations: rec.evaluations,
    analysisEngineId: rec.analysisEngineId,
    analysisDepth: rec.analysisDepth,
    analysisStatus: rec.analysisStatus ? RECORD_STATUS_TO_STUDIO[rec.analysisStatus] : undefined,
    analyzedPliesCount: rec.analyzedPliesCount,
    activeForkPointers: rec.activeForkPointers,
    openingLine: rec.openingLine,
  };
}

/**
 * Builds a KifuRecord from a SavedStudioGame view (studio write path).
 * When `base` (the existing stored record) is provided, KifuRecord-only
 * fields (notes, favorite, reviewStatus, isIncludedInTree, cloud claim
 * fields, origin ids) are preserved.
 */
export function studioGameToKifuRecord(
  game: SavedStudioGame,
  base?: KifuRecord
): KifuRecord {
  const now = new Date().toISOString();
  const jkfJson = game.jkfJson || '{}';
  const contentHash =
    jkfJson === '{}' && !game.rawKif && base?.contentHash
      ? base.contentHash
      : computeKifuRecordContentHash({ jkfJson, rawKif: game.rawKif });
  return {
    id: game.id,
    title: game.title,
    contentHash,
    source: 'studio',
    senteName: game.senteName,
    goteName: game.goteName,
    sentePlayerId: game.sentePlayerId,
    gotePlayerId: game.gotePlayerId,
    matchDate: game.matchDate,
    tournament: game.tournament,
    openingId: game.openingId,
    openingName: game.openingName,
    winner: game.winner,
    totalPlies: game.totalPlies,
    jkfJson,
    rawKif: game.rawKif,
    tags: game.tags ?? base?.tags ?? [],
    tagIds:
      base?.tagIds &&
      game.tags &&
      base.tags.length === game.tags.length &&
      base.tags.every((t, i) => t === game.tags?.[i])
        ? base.tagIds
        : undefined,
    gameKind:
      game.gameKind ??
      base?.gameKind ??
      inferGameKind({
        sentePlayerId: game.sentePlayerId,
        gotePlayerId: game.gotePlayerId,
        senteName: game.senteName,
        goteName: game.goteName,
        tournament: game.tournament,
        tags: game.tags ?? base?.tags ?? [],
      }),
    notes: base?.notes,
    favorite: base?.favorite,
    reviewStatus: base?.reviewStatus,
    evaluations: game.evaluations ?? base?.evaluations,
    analysisEngineId: game.analysisEngineId ?? base?.analysisEngineId,
    analysisDepth: game.analysisDepth ?? base?.analysisDepth,
    analysisStatus:
      game.analysisStatus === 'analyzing' &&
      (base?.analysisStatus === 'queued' || base?.analysisStatus === 'processing')
        ? base.analysisStatus
        : game.analysisStatus
        ? STUDIO_STATUS_TO_RECORD[game.analysisStatus]
        : base?.analysisStatus,
    analyzedPliesCount: game.analyzedPliesCount ?? base?.analyzedPliesCount,
    analysisJobId: base?.analysisJobId,
    analysisClaimedAt: base?.analysisClaimedAt,
    analysisError: base?.analysisError,
    isIncludedInTree: base?.isIncludedInTree ?? false,
    activeForkPointers: game.activeForkPointers ?? base?.activeForkPointers,
    openingLine: game.openingLine ?? base?.openingLine,
    createdAt: base?.createdAt ?? game.createdAt ?? now,
    updatedAt: now,
    originStudioGameId: base?.originStudioGameId ?? game.id,
    originIngestedGameId: base?.originIngestedGameId,
  };
}

// ---------------------------------------------------------------------------
// Firestore document normalization (Issue #42e)
// ---------------------------------------------------------------------------

/** Schema marker written into every Firestore game document. */
export const KIFU_RECORD_SCHEMA_VERSION = 1;

const VALID_SOURCES: ReadonlySet<string> = new Set(['studio', 'tree', 'import']);

/**
 * Serializes a KifuRecord into a Firestore-safe document.
 * Adds the schema marker and strips undefined values (Firestore rejects them).
 */
export function kifuRecordToFirestoreDoc(record: KifuRecord): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    ...record,
    recordSchema: KIFU_RECORD_SCHEMA_VERSION,
  };
  return JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
}

export interface FirestoreDocDecodeResult {
  record: KifuRecord;
  /** True when the source doc used the legacy SavedStudioGame schema. */
  wasLegacy: boolean;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/**
 * Decodes a Firestore game document into a KifuRecord.
 * - recordSchema === 1 (or a recognizable record shape): validated directly.
 * - Legacy SavedStudioGame docs (jkfJson present, no `source`): converted
 *   through studioGameToKifuRecord so cloud migration is lossless.
 * Returns null for documents that match neither schema.
 */
export function firestoreDocToKifuRecord(
  data: unknown,
  docId: string
): FirestoreDocDecodeResult | null {
  if (!isPlainObject(data)) return null;
  const now = new Date().toISOString();

  const hasRecordMarker =
    data.recordSchema === KIFU_RECORD_SCHEMA_VERSION ||
    (typeof data.source === 'string' &&
      VALID_SOURCES.has(data.source) &&
      typeof data.contentHash === 'string');

  if (hasRecordMarker) {
    const id = str(data.id) ?? docId;
    if (!id) return null;
    const source = str(data.source);
    const record: KifuRecord = {
      id,
      title: str(data.title) ?? '',
      contentHash: str(data.contentHash) ?? '',
      source: (VALID_SOURCES.has(source ?? '') ? source : 'studio') as KifuRecord['source'],
      senteName: str(data.senteName) ?? '',
      goteName: str(data.goteName) ?? '',
      sentePlayerId: str(data.sentePlayerId),
      gotePlayerId: str(data.gotePlayerId),
      matchDate: str(data.matchDate),
      tournament: str(data.tournament),
      openingId: str(data.openingId) ?? 'other',
      openingName: str(data.openingName) ?? '',
      winner: (['sente', 'gote', 'draw', 'unknown'] as const).includes(
        data.winner as 'sente'
      )
        ? (data.winner as KifuRecord['winner'])
        : 'unknown',
      totalPlies: typeof data.totalPlies === 'number' ? data.totalPlies : 0,
      jkfJson: str(data.jkfJson) ?? '{}',
      rawKif: str(data.rawKif),
      tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
      tagIds: Array.isArray(data.tagIds)
        ? (data.tagIds as string[]).filter((s): s is string => typeof s === 'string')
        : undefined,
      gameKind:
        data.gameKind === 'pro' ||
        data.gameKind === 'ladies' ||
        data.gameKind === 'amateur' ||
        data.gameKind === 'self' ||
        data.gameKind === 'joseki' ||
        data.gameKind === 'other'
          ? (data.gameKind as KifuGameKind)
          : 'other',
      notes: str(data.notes),
      favorite: typeof data.favorite === 'boolean' ? data.favorite : undefined,
      reviewStatus: str(data.reviewStatus) as KifuRecord['reviewStatus'],
      evaluations: isPlainObject(data.evaluations)
        ? (data.evaluations as Record<number, MoveEvaluation>)
        : undefined,
      analysisEngineId: str(data.analysisEngineId),
      analysisDepth: typeof data.analysisDepth === 'number' ? data.analysisDepth : undefined,
      analysisStatus: str(data.analysisStatus) as KifuRecord['analysisStatus'],
      analyzedPliesCount:
        typeof data.analyzedPliesCount === 'number' ? data.analyzedPliesCount : undefined,
      analysisJobId: str(data.analysisJobId),
      analysisClaimedAt: str(data.analysisClaimedAt),
      analysisError: str(data.analysisError),
      analysisTargetNodes:
        typeof data.analysisTargetNodes === 'number' ? data.analysisTargetNodes : undefined,
      analysisForceReanalyze:
        typeof data.analysisForceReanalyze === 'boolean'
          ? data.analysisForceReanalyze
          : undefined,
      positionSfens: Array.isArray(data.positionSfens)
        ? (data.positionSfens as string[]).filter((s): s is string => typeof s === 'string')
        : undefined,
      analysisQueuePosition:
        typeof data.analysisQueuePosition === 'number' ? data.analysisQueuePosition : undefined,
      isIncludedInTree: data.isIncludedInTree === true,
      activeForkPointers: Array.isArray(data.activeForkPointers)
        ? (data.activeForkPointers as KifuRecord['activeForkPointers'])
        : undefined,
      openingLine: Array.isArray(data.openingLine)
        ? (data.openingLine as KifuRecord['openingLine'])
        : undefined,
      createdAt: str(data.createdAt) ?? now,
      updatedAt: str(data.updatedAt) ?? now,
      originStudioGameId: str(data.originStudioGameId),
      originIngestedGameId: str(data.originIngestedGameId),
    };
    return { record, wasLegacy: false };
  }

  // Legacy SavedStudioGame schema: has jkfJson but no `source` field.
  const looksLikeStudioGame =
    typeof data.jkfJson === 'string' &&
    typeof data.senteName === 'string' &&
    typeof data.goteName === 'string' &&
    typeof data.id === 'string' &&
    data.id.length > 0;

  if (!looksLikeStudioGame) return null;

  const legacyView: SavedStudioGame = {
    id: data.id as string,
    title: str(data.title) ?? '',
    senteName: data.senteName as string,
    goteName: data.goteName as string,
    sentePlayerId: str(data.sentePlayerId),
    gotePlayerId: str(data.gotePlayerId),
    winner: (['sente', 'gote', 'draw', 'unknown'] as const).includes(
      data.winner as 'sente'
    )
      ? (data.winner as SavedStudioGame['winner'])
      : undefined,
    openingId: str(data.openingId) ?? 'other',
    openingName: str(data.openingName) ?? '',
    totalPlies: typeof data.totalPlies === 'number' ? data.totalPlies : 0,
    forkCount: typeof data.forkCount === 'number' ? data.forkCount : 0,
    rawKif: str(data.rawKif),
    jkfJson: data.jkfJson as string,
    createdAt: str(data.createdAt) ?? now,
    updatedAt: str(data.updatedAt) ?? now,
    matchDate: str(data.matchDate),
    tournament: str(data.tournament),
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    evaluations: isPlainObject(data.evaluations)
      ? (data.evaluations as Record<number, MoveEvaluation>)
      : undefined,
    analysisEngineId: str(data.analysisEngineId),
    analysisDepth: typeof data.analysisDepth === 'number' ? data.analysisDepth : undefined,
    analysisStatus: str(data.analysisStatus) as SavedStudioGame['analysisStatus'],
    analyzedPliesCount:
      typeof data.analyzedPliesCount === 'number' ? data.analyzedPliesCount : undefined,
    activeForkPointers: Array.isArray(data.activeForkPointers)
      ? (data.activeForkPointers as SavedStudioGame['activeForkPointers'])
      : undefined,
  };

  return { record: studioGameToKifuRecord(legacyView), wasLegacy: true };
}

// ---------------------------------------------------------------------------
// Tree view conversions (KifuRecord <-> IngestedGame / GameMergeInput)
// ---------------------------------------------------------------------------

/**
 * Projects a KifuRecord into the legacy IngestedGame view shape.
 * userId falls back to the default app user since KifuRecord does not
 * carry ownership (ownership lives in the Firestore path).
 */
export function kifuRecordToIngestedGame(rec: KifuRecord): IngestedGame {
  const hasEvals = rec.evaluations != null && Object.keys(rec.evaluations).length > 0;
  return {
    id: rec.id,
    userId: DEFAULT_APP_USER_ID,
    openingId: rec.openingId,
    title: rec.title,
    date: rec.matchDate,
    senteName: rec.senteName,
    goteName: rec.goteName,
    tournament: rec.tournament,
    winner: winnerToIngested(rec.winner),
    plyCount: rec.totalPlies,
    rawKif: rec.rawKif ?? '',
    isIncluded: rec.isIncludedInTree,
    isAnalyzed: rec.analysisStatus === 'completed' || hasEvals,
    analysisStatus: rec.analysisStatus ?? (hasEvals ? 'completed' : 'unanalyzed'),
    analysisEngineId: rec.analysisEngineId,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

/**
 * Builds a KifuRecord from a GameMergeInput (tree write path).
 * Harvests move.evaluation into the record evaluations map (#42b behavior
 * centralized here) and regenerates jkfJson from rawKif.
 * `openingNameOverride` lets callers supply a localized display name.
 */
export function ingestedInputToKifuRecord(
  item: GameMergeInput,
  base?: KifuRecord,
  openingNameOverride?: string
): KifuRecord {
  const game = item.game;
  const now = new Date().toISOString();
  const jkfJson = rawKifToJkfJson(game.rawKif) || base?.jkfJson || '{}';
  const evaluations = movesEvaluationToRecordMap(item.moves) ?? base?.evaluations;
  const hasEvals = evaluations != null && Object.keys(evaluations).length > 0;

  return {
    id: game.id,
    title: game.title,
    contentHash: computeKifuRecordContentHash({ jkfJson, rawKif: game.rawKif }),
    source: base?.source ?? 'tree',
    senteName: game.senteName,
    goteName: game.goteName,
    matchDate: game.date,
    tournament: game.tournament,
    openingId: game.openingId,
    openingName: openingNameOverride ?? base?.openingName ?? game.openingId,
    winner: winnerFromIngested(game.winner),
    totalPlies: game.plyCount,
    jkfJson,
    rawKif: game.rawKif,
    tags: base?.tags ?? [],
    tagIds: base?.tagIds,
    gameKind:
      base?.gameKind ??
      inferGameKind({
        senteName: game.senteName,
        goteName: game.goteName,
        tournament: game.tournament,
        tags: base?.tags ?? [],
      }),
    notes: base?.notes,
    favorite: base?.favorite,
    reviewStatus: base?.reviewStatus,
    evaluations,
    analysisStatus:
      game.isAnalyzed || hasEvals
        ? 'completed'
        : (base?.analysisStatus ?? game.analysisStatus ?? 'unanalyzed'),
    analysisEngineId: base?.analysisEngineId ?? game.analysisEngineId,
    analyzedPliesCount: evaluations ? Object.keys(evaluations).length : base?.analyzedPliesCount,
    analysisJobId: base?.analysisJobId,
    analysisClaimedAt: base?.analysisClaimedAt,
    analysisError: base?.analysisError,
    isIncludedInTree: game.isIncluded !== false,
    activeForkPointers: base?.activeForkPointers,
    createdAt: base?.createdAt ?? game.createdAt ?? now,
    updatedAt: now,
    originStudioGameId: base?.originStudioGameId,
    originIngestedGameId: base?.originIngestedGameId ?? game.id,
  };
}
