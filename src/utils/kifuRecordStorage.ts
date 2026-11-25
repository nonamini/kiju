/**
 * Storage persistence for unified KifuRecord entities.
 * Follows the same localStorage + in-memory fallback pattern as
 * studioKifuStorage / quizPoolStorage.
 * Spec: docs/spec/kifu_management_enhancement.md (Issue #39).
 * Follows Rule 1: strictly English code, comments, and identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import { KifuRecord } from '../types/kifuRecord';
import { sanitizeJapaneseMoveFunari } from './shogiRules';
import { scheduleAutoBackupToSyncDirectory } from './folderSyncBackup';
import { inferGameKind } from './gameKindClassifier';
import { idbGet, idbSet } from './idbKeyVal';
import { extractOpeningLineFromJkf } from './kifuOpeningLine';
import { deleteCachedKifuPayload, putCachedKifuPayload, toMetadataOnlyRecord } from './kifuPayloadCache';
import { getSafeStorage } from './matchHistoryStorage';
import { computeKifuEvaluationSummary } from './playerEvaluationAggregator';
import {
  resolveTagIdsFromNames,
  resolveTagNamesFromIds,
  syncRecordTagsWithRegistry,
} from './tagRegistryStorage';

export const KIFU_RECORDS_STORAGE_KEY = 'joseki_tree_kifu_records';
export const DELETED_KIFU_IDS_KEY = 'joseki_tree_deleted_kifu_ids';

export function loadDeletedKifuIds(): string[] {
  try {
    const raw = getSafeStorage().getItem(DELETED_KIFU_IDS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    return [];
  }
}

function persistDeletedKifuIds(ids: string[]): void {
  try {
    getSafeStorage().setItem(DELETED_KIFU_IDS_KEY, JSON.stringify(ids));
  } catch (err) {
    console.error('Failed to save deleted kifu tombstones:', err);
  }
}

export function markKifuRecordDeleted(id: string): void {
  if (!id) return;
  const current = loadDeletedKifuIds();
  if (current.includes(id)) return;
  persistDeletedKifuIds([...current, id]);
}

export function clearDeletedKifuId(id: string): void {
  if (!id) return;
  const current = loadDeletedKifuIds();
  if (!current.includes(id)) return;
  persistDeletedKifuIds(current.filter((item) => item !== id));
}

let memoryCache: KifuRecord[] | null = null;

function stripPositionSfens(records: KifuRecord[]): KifuRecord[] {
  return records.map((rec) => {
    if (!rec.positionSfens) return rec;
    const { positionSfens: _dropped, ...rest } = rec;
    return rest;
  });
}

function readFromSafeStorage(): KifuRecord[] {
  try {
    const storage = getSafeStorage();
    const raw = storage.getItem(KIFU_RECORDS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as KifuRecord[];
  } catch (err) {
    console.error('Failed to load kifu records:', err);
    return [];
  }
}

function enrichRecordBeforeSplit(rec: KifuRecord): KifuRecord {
  const openingLine =
    rec.openingLine && rec.openingLine.length > 0
      ? rec.openingLine
      : extractOpeningLineFromJkf(rec.jkfJson);
  const evaluationSummary =
    rec.evaluationSummary ?? computeKifuEvaluationSummary(rec);
  return {
    ...rec,
    ...(openingLine.length > 0 ? { openingLine } : {}),
    ...(evaluationSummary ? { evaluationSummary } : {}),
  };
}

async function splitToMetadataAndPayloadCache(
  records: KifuRecord[],
  dirty: boolean
): Promise<{ metadata: KifuRecord[]; changed: boolean }> {
  let changed = false;
  const metadata: KifuRecord[] = [];
  for (const rec of records) {
    const hasHeavyPayload =
      (rec.jkfJson && rec.jkfJson !== '{}') ||
      rec.rawKif !== undefined ||
      rec.evaluations !== undefined;
    if (!hasHeavyPayload) {
      metadata.push(rec);
      continue;
    }
    changed = true;
    const enriched = enrichRecordBeforeSplit(rec);
    await putCachedKifuPayload(enriched, { dirty });
    metadata.push(toMetadataOnlyRecord(enriched));
  }
  return { metadata, changed };
}

/**
 * Hydrates the in-memory cache from IndexedDB on app boot and migrates any
 * legacy localStorage payload into IndexedDB, freeing localStorage quota.
 * Heavy payloads are split into the LRU payload cache while metadata +
 * openingLine stay in the lightweight index.
 * No-ops when indexedDB is unavailable (e.g., unit tests).
 */
export async function initKifuRecordStorage(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const idbRecords = await idbGet<KifuRecord[]>(KIFU_RECORDS_STORAGE_KEY);
    const storage = getSafeStorage();
    if (Array.isArray(idbRecords)) {
      const cleaned = stripPositionSfens(idbRecords);
      const { metadata, changed } = await splitToMetadataAndPayloadCache(cleaned, true);
      memoryCache = metadata;
      if (changed) {
        await idbSet(KIFU_RECORDS_STORAGE_KEY, metadata);
      }
      // Reclaim localStorage space if a stale copy still exists.
      storage.removeItem(KIFU_RECORDS_STORAGE_KEY);
      return;
    }

    const legacyRecords = stripPositionSfens(readFromSafeStorage());
    const { metadata } = await splitToMetadataAndPayloadCache(legacyRecords, true);
    await idbSet(KIFU_RECORDS_STORAGE_KEY, metadata);
    memoryCache = metadata;
    storage.removeItem(KIFU_RECORDS_STORAGE_KEY);
  } catch (err) {
    console.warn('IndexedDB unavailable for kifu records; falling back to localStorage:', err);
    memoryCache = null;
  }
}

/**
 * Loads all kifu records from storage.
 * Returns an empty array when data is missing, invalid, or corrupt JSON.
 */
export function loadKifuRecords(): KifuRecord[] {
  if (memoryCache !== null) {
    return [...memoryCache];
  }
  const records = readFromSafeStorage();
  let migrated = false;
  const cleaned = records.map((rec) => {
    if (!rec.openingLine || rec.openingLine.length === 0) return rec;
    let lineChanged = false;
    const nextLine = rec.openingLine.map((mv, idx) => {
      const sanitized = sanitizeJapaneseMoveFunari(mv.japaneseMove, mv.usi, (idx + 1) % 2 === 1);
      if (sanitized !== mv.japaneseMove) {
        lineChanged = true;
        return { ...mv, japaneseMove: sanitized };
      }
      return mv;
    });
    if (!lineChanged) return rec;
    migrated = true;
    return { ...rec, openingLine: nextLine };
  });
  if (migrated) {
    saveKifuRecords(cleaned);
  }
  return cleaned;
}

/**
 * Finds a single kifu record by id. Returns null when not found.
 */
export function getKifuRecord(id: string): KifuRecord | null {
  const records = loadKifuRecords();
  return records.find((r) => r.id === id) ?? null;
}

/**
 * Upserts a single kifu record.
 * - New id: appends the record.
 * - Existing id: replaces the stored record but preserves createdAt
 *   and refreshes updatedAt.
 */
export function saveKifuRecord(record: KifuRecord): void {
  clearDeletedKifuId(record.id);
  const records = loadKifuRecords();
  const now = new Date().toISOString();
  const idx = records.findIndex((r) => r.id === record.id);
  const next: KifuRecord = syncRecordTagsWithRegistry({
    ...record,
    createdAt: idx >= 0 ? records[idx]!.createdAt : record.createdAt || now,
    updatedAt: now,
  });
  if (idx >= 0) {
    records[idx] = next;
  } else {
    records.push(next);
  }
  saveKifuRecords(records);
}

/**
 * Persists a full list of kifu records (used by migration/import flows).
 */
export function saveKifuRecords(
  records: KifuRecord[],
  options: { fromCloud?: boolean } = {}
): void {
  scheduleAutoBackupToSyncDirectory();
  const sanitized = stripPositionSfens(records)
    .map(syncRecordTagsWithRegistry)
    .map((rec) =>
      rec.gameKind ? rec : { ...rec, gameKind: inferGameKind(rec) }
    );
  if (memoryCache !== null) {
    const dirty = !options.fromCloud;
    const metadata = sanitized.map((rec) => {
      const hasHeavyPayload =
        (rec.jkfJson && rec.jkfJson !== '{}') ||
        rec.rawKif !== undefined ||
        rec.evaluations !== undefined;
      if (!hasHeavyPayload) return rec;
      const enriched = enrichRecordBeforeSplit(rec);
      void putCachedKifuPayload(enriched, { dirty });
      return toMetadataOnlyRecord(enriched);
    });
    memoryCache = metadata;
    void idbSet(KIFU_RECORDS_STORAGE_KEY, metadata).catch((err) => {
      console.error('Failed to save kifu records to IndexedDB:', err);
    });
    return;
  }
  try {
    const storage = getSafeStorage();
    storage.setItem(KIFU_RECORDS_STORAGE_KEY, JSON.stringify(sanitized));
  } catch (err) {
    console.error('Failed to save kifu records:', err);
  }
}

/**
 * Purges deleted record IDs from legacy localStorage keys so one-time migration
 * never resurrects deleted records after deletion tombstones are cleared.
 */
export function purgeIdsFromLegacyStorages(ids: Set<string>): void {
  if (ids.size === 0) return;
  try {
    const storage = getSafeStorage();
    const studioKeys = [
      'joseki_tree_studio_saved_games',
      'joseki_tree_studio_games',
    ];
    for (const key of studioKeys) {
      const raw = storage.getItem(key);
      if (!raw) continue;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;
      const filtered = parsed.filter((item) => {
        if (!item || typeof item !== 'object') return true;
        const id = (item as { id?: unknown }).id;
        return typeof id !== 'string' || !ids.has(id);
      });
      if (filtered.length !== parsed.length) {
        storage.setItem(key, JSON.stringify(filtered));
      }
    }

    const ingestedKey = 'joseki_tree_ingested_games';
    const rawIngested = storage.getItem(ingestedKey);
    if (rawIngested) {
      const parsed: unknown = JSON.parse(rawIngested);
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter((item) => {
          if (!item || typeof item !== 'object') return true;
          const rec = item as { id?: unknown; game?: { id?: unknown } };
          const gameId =
            typeof rec.game?.id === 'string'
              ? rec.game.id
              : typeof rec.id === 'string'
                ? rec.id
                : null;
          return !gameId || !ids.has(gameId);
        });
        if (filtered.length !== parsed.length) {
          storage.setItem(ingestedKey, JSON.stringify(filtered));
        }
      }
    }
  } catch {
    // Ignore malformed legacy storage payloads
  }
}

/**
 * Deletes a kifu record by id. No-op when the id does not exist.
 */
export function deleteKifuRecord(id: string): void {
  const records = loadKifuRecords().filter((r) => r.id !== id);
  saveKifuRecords(records);
  markKifuRecordDeleted(id);
  purgeIdsFromLegacyStorages(new Set([id]));
  void deleteCachedKifuPayload(id);
}

/**
 * Applies a partial patch to an existing record.
 * Returns the updated record, or null when the id does not exist.
 */
export function updateKifuRecord(
  id: string,
  patch: Partial<KifuRecord>
): KifuRecord | null {
  const records = loadKifuRecords();
  const idx = records.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const resolvedPatch: Partial<KifuRecord> = { ...patch };
  if (patch.tags !== undefined && patch.tagIds === undefined) {
    const tagIds = resolveTagIdsFromNames(patch.tags);
    resolvedPatch.tagIds = tagIds;
    resolvedPatch.tags = resolveTagNamesFromIds(tagIds);
  } else if (patch.tagIds !== undefined && patch.tags === undefined) {
    resolvedPatch.tags = resolveTagNamesFromIds(patch.tagIds);
  }
  const updated: KifuRecord = {
    ...records[idx]!,
    ...resolvedPatch,
    id, // id must never be overwritten by the patch
    updatedAt: new Date().toISOString(),
  };
  records[idx] = updated;
  saveKifuRecords(records);
  return updated;
}

/**
 * Re-synchronizes every stored KifuRecord's derived `tags` array from the
 * current TagRegistry (called after renaming or deleting a TagDefinition).
 */
export function syncAllRecordTagsWithRegistry(): number {
  const records = loadKifuRecords();
  let changedCount = 0;
  const next = records.map((rec) => {
    const synced = syncRecordTagsWithRegistry(rec);
    const tagsChanged =
      synced.tags.length !== rec.tags.length ||
      synced.tags.some((t, i) => t !== rec.tags[i]);
    const idsChanged =
      (synced.tagIds?.length ?? 0) !== (rec.tagIds?.length ?? 0) ||
      (synced.tagIds ?? []).some((id, i) => id !== rec.tagIds?.[i]);
    if (tagsChanged || idsChanged) {
      changedCount++;
      return { ...synced, updatedAt: new Date().toISOString() };
    }
    return rec;
  });
  if (changedCount > 0) {
    saveKifuRecords(next);
  }
  return changedCount;
}
