/**
 * One-time migration from legacy kifu storages to unified KifuRecord.
 * Sources:
 *   - SavedStudioGame[]  (joseki_tree_studio_saved_games + legacy key)
 *   - GameMergeInput[]   (joseki_tree_ingested_games, .game is IngestedGame)
 *
 * Idempotent: records already migrated are detected via
 * originStudioGameId / originIngestedGameId / existing ids and skipped.
 * Legacy keys are left untouched (read-only) for safety.
 * Spec: docs/spec/kifu_management_enhancement.md (Issue #41).
 * Follows Rule 1: strictly English code, comments, and identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import { KifuRecord, KifuWinner } from '../types/kifuRecord';
import { IngestedGame } from '../types/tree';
import { GameMergeInput } from './treeMerger';
import { computeKifuRecordContentHash } from './kifuContentHash';
import {
  movesEvaluationToRecordMap,
  rawKifToJkfJson,
  resolveOpeningName,
} from './kifuRecordCodec';
import {
  loadDeletedKifuIds,
  loadKifuRecords,
  saveKifuRecords,
} from './kifuRecordStorage';
import {
  loadLegacyStudioGamesRaw,
  SavedStudioGame,
} from './studioKifuStorage';
import { loadLegacyIngestedGamesRaw } from './ingestedGamesStorage';

export interface KifuMigrationResult {
  migrated: number;
  skipped: number;
  errors: number;
}

/**
 * Maps legacy IngestedGame.winner ('b' | 'w' | 'draw' | 'unknown') to KifuWinner.
 */
function mapIngestedWinner(winner: IngestedGame['winner']): KifuWinner {
  if (winner === 'b') return 'sente';
  if (winner === 'w') return 'gote';
  if (winner === 'draw') return 'draw';
  return 'unknown';
}

/**
 * Converts a SavedStudioGame into a KifuRecord.
 * The original id is preserved to keep references intact
 * (quiz cards, tree gameRefs, match links all key off game.id).
 */
export function studioGameToKifuRecord(game: SavedStudioGame): KifuRecord {
  const now = new Date().toISOString();
  const jkfJson = game.jkfJson || '{}';
  return {
    id: game.id,
    title: game.title,
    contentHash: computeKifuRecordContentHash({ jkfJson, rawKif: game.rawKif }),
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
    tags: game.tags ?? [],
    evaluations: game.evaluations,
    analysisEngineId: game.analysisEngineId,
    analysisDepth: game.analysisDepth,
    analysisStatus: game.analysisStatus,
    analyzedPliesCount: game.analyzedPliesCount,
    activeForkPointers: game.activeForkPointers,
    isIncludedInTree: false,
    createdAt: game.createdAt || now,
    updatedAt: game.updatedAt || now,
    originStudioGameId: game.id,
  };
}

/**
 * Converts an ingested GameMergeInput (tree ingestion) into a KifuRecord.
 * Per-ply move evaluations are harvested into KifuRecord.evaluations so
 * analysis results are not stranded in the legacy moves[] payload (#42b).
 */
export function ingestedGameToKifuRecord(item: GameMergeInput): KifuRecord {
  const game = item.game;
  const now = new Date().toISOString();
  const jkfJson = rawKifToJkfJson(game.rawKif);
  const evaluations = movesEvaluationToRecordMap(item.moves);
  const hasEvaluations = evaluations != null && Object.keys(evaluations).length > 0;
  return {
    id: game.id,
    title: game.title,
    contentHash: computeKifuRecordContentHash({ jkfJson, rawKif: game.rawKif }),
    source: 'tree',
    senteName: game.senteName,
    goteName: game.goteName,
    matchDate: game.date,
    tournament: game.tournament,
    openingId: game.openingId,
    openingName: resolveOpeningName(game.openingId),
    winner: mapIngestedWinner(game.winner),
    totalPlies: game.plyCount,
    jkfJson,
    rawKif: game.rawKif,
    tags: [],
    evaluations,
    analysisStatus: game.isAnalyzed || hasEvaluations ? 'completed' : 'unanalyzed',
    analyzedPliesCount: evaluations ? Object.keys(evaluations).length : undefined,
    isIncludedInTree: game.isIncluded !== false,
    createdAt: game.createdAt || now,
    updatedAt: game.updatedAt || now,
    originIngestedGameId: game.id,
  };
}

/**
 * Backfills KifuRecord.evaluations for records already migrated before
 * per-ply evaluation harvesting existed. Returns null when nothing to do.
 */
function backfillIngestedEvaluations(
  record: KifuRecord,
  item: GameMergeInput
): KifuRecord | null {
  if (record.evaluations && Object.keys(record.evaluations).length > 0) return null;
  const evaluations = movesEvaluationToRecordMap(item.moves);
  if (!evaluations) return null;
  return {
    ...record,
    evaluations,
    analyzedPliesCount: Object.keys(evaluations).length,
    analysisStatus: 'completed',
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Runs the legacy -> KifuRecord migration.
 * Safe to call multiple times: already-migrated records are skipped.
 * Returns counts for logging/telemetry.
 */
export function migrateLegacyKifuData(): KifuMigrationResult {
  const result: KifuMigrationResult = { migrated: 0, skipped: 0, errors: 0 };

  try {
    const existing = loadKifuRecords();
    const deletedIds = new Set(loadDeletedKifuIds());
    const existingIds = new Set(existing.map((r) => r.id));
    const existingOrigins = new Set<string>();
    for (const r of existing) {
      if (r.originStudioGameId) existingOrigins.add(r.originStudioGameId);
      if (r.originIngestedGameId) existingOrigins.add(r.originIngestedGameId);
    }

    const migrated: KifuRecord[] = [];
    const backfilled = new Map<string, KifuRecord>();

    // 1. Studio games — read legacy keys directly because
    // loadSavedStudioGames() is now backed by KifuRecord storage (#42d).
    for (const game of loadLegacyStudioGamesRaw()) {
      try {
        if (!game || !game.id) {
          result.skipped++;
          continue;
        }
        if (deletedIds.has(game.id)) {
          result.skipped++;
          continue;
        }
        if (
          deletedIds.has(game.id) ||
          existingOrigins.has(game.id) ||
          existingIds.has(game.id)
        ) {
          result.skipped++;
          continue;
        }
        migrated.push(studioGameToKifuRecord(game));
        existingIds.add(game.id);
        existingOrigins.add(game.id);
      } catch (err) {
        console.error(`Failed to migrate studio game ${game?.id}:`, err);
        result.errors++;
      }
    }

    // 2. Ingested (tree) games — read the legacy key directly because
    // loadIngestedGames() is now backed by KifuRecord storage (#42c).
    for (const item of loadLegacyIngestedGamesRaw()) {
      try {
        const game = item?.game;
        if (!game || !game.id) {
          result.skipped++;
          continue;
        }
        if (deletedIds.has(game.id)) {
          result.skipped++;
          continue;
        }
        const alreadyMigrated = existingOrigins.has(game.id) || existingIds.has(game.id);
        if (alreadyMigrated) {
          result.skipped++;
          // Backfill evaluations for records migrated before #42b.
          const existingRec = existing.find(
            (r) => r.id === game.id || r.originIngestedGameId === game.id
          );
          if (existingRec && !backfilled.has(existingRec.id)) {
            const updated = backfillIngestedEvaluations(existingRec, item);
            if (updated) backfilled.set(existingRec.id, updated);
          }
          continue;
        }
        migrated.push(ingestedGameToKifuRecord(item));
        existingIds.add(game.id);
        existingOrigins.add(game.id);
      } catch (err) {
        console.error(`Failed to migrate ingested game ${item?.game?.id}:`, err);
        result.errors++;
      }
    }

    if (migrated.length > 0 || backfilled.size > 0) {
      const mergedExisting =
        backfilled.size > 0
          ? existing.map((r) => backfilled.get(r.id) ?? r)
          : existing;
      saveKifuRecords([...mergedExisting, ...migrated]);
      result.migrated = migrated.length;
    }
  } catch (err) {
    console.error('KifuRecord migration failed:', err);
    result.errors++;
  }

  return result;
}
