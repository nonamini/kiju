/**
 * Storage adapter for tree-ingested games (Issue #42c).
 *
 * Persistence backend is now the unified KifuRecord store
 * (joseki_tree_kifu_records, source === 'tree'). The public API still
 * returns GameMergeInput so existing callers (App.tsx, treeMerger,
 * quiz extraction, KifuLibraryTable) keep working unchanged.
 *
 * Rehydration: moves/variations are rebuilt by re-parsing rawKif, and
 * KifuRecord.evaluations are re-injected onto moves by ply number.
 * Legacy key joseki_tree_ingested_games is no longer read or written
 * here (the one-time migration reads it directly).
 *
 * Follows Rule 1: strictly English code, comments, identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import type { KifuRecord } from '../types/kifuRecord';
import type { ShogiMove } from '../types/shogi';
import { getSafeStorage } from './matchHistoryStorage';
import { loadKifuRecords, saveKifuRecords } from './kifuRecordStorage';
import {
  applyRecordEvaluationsToMoves,
  ingestedInputToKifuRecord,
  kifuRecordToIngestedGame,
  resolveOpeningName,
} from './kifuRecordCodec';
import { parseKif, ParsedVariation } from './kifParser';
import { GameMergeInput } from './treeMerger';

/**
 * Legacy storage key. Kept exported for the one-time migration and tests;
 * this module no longer reads or writes it.
 */
export const INGESTED_GAMES_STORAGE_KEY = 'joseki_tree_ingested_games';

/**
 * Rebuilds a GameMergeInput view from a stored KifuRecord.
 * Move data is re-parsed from rawKif; per-ply evaluations are re-injected
 * from record.evaluations. Records without rawKif degrade to empty moves.
 */
function recordToMergeInput(record: KifuRecord): GameMergeInput {
  const game = kifuRecordToIngestedGame(record);
  let moves: ShogiMove[] = [];
  let variations: ParsedVariation[] | undefined;

  if (record.rawKif) {
    try {
      const parsed = parseKif(record.rawKif);
      moves = applyRecordEvaluationsToMoves(parsed.moves, record.evaluations);
      variations = parsed.variations;
    } catch (err) {
      console.error(`Failed to re-parse kifu for record ${record.id}:`, err);
    }
  } else {
    console.warn(`KifuRecord ${record.id} has no rawKif; tree moves unavailable`);
  }

  return { game, moves, variations };
}

/**
 * Loads previously ingested games (tree view) from KifuRecord storage.
 * Includes both native tree-source records and Studio/import records
 * explicitly marked as `isIncludedInTree`.
 */
export function loadIngestedGames(): GameMergeInput[] {
  try {
    return loadKifuRecords()
      .filter((r) => r.source === 'tree' || r.isIncludedInTree === true)
      .map(recordToMergeInput);
  } catch (err) {
    console.error('Failed to load ingested games from storage:', err);
    return [];
  }
}

/**
 * Saves the full tree-ingested games list.
 * Converts each GameMergeInput to a KifuRecord (harvesting move evaluations)
 * and replaces only source==='tree' records, preserving all other sources.
 */
export function saveIngestedGames(games: GameMergeInput[]): void {
  try {
    const existing = loadKifuRecords();
    const byId = new Map(existing.map((r) => [r.id, r]));

    const converted = games.map((item) => {
      const game = item.game;
      const base = byId.get(game.id);
      const openingName =
        base?.openingName ?? resolveOpeningName(game.openingId);
      return ingestedInputToKifuRecord(item, base, openingName);
    });

    const convertedIds = new Set(converted.map((r) => r.id));
    const kept = existing.filter(
      (r) => r.source !== 'tree' && !r.isIncludedInTree && !convertedIds.has(r.id)
    );
    saveKifuRecords([...kept, ...converted]);
  } catch (err) {
    console.error('Failed to save ingested games to storage:', err);
  }
}

/**
 * Reads the legacy ingested-games payload directly from the old key.
 * Used ONLY by the one-time migration (kifuRecordMigration.ts); the
 * public loadIngestedGames() above no longer touches this key.
 */
export function loadLegacyIngestedGamesRaw(): GameMergeInput[] {
  try {
    const storage = getSafeStorage();
    const raw = storage.getItem(INGESTED_GAMES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as GameMergeInput[];
  } catch (err) {
    console.error('Failed to load legacy ingested games:', err);
    return [];
  }
}
