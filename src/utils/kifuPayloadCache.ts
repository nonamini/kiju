/**
 * IndexedDB LRU cache for heavy KifuRecord payloads (jkfJson, rawKif, evaluations).
 * Keeps at most MAX_CACHED_PAYLOADS synced games in IndexedDB, while pinning any
 * `dirty: true` (locally created/modified, not yet synced to Firestore) payloads
 * so unsynced local work is never evicted.
 * Gracefully no-ops when indexedDB is unavailable (Node/Vitest).
 */

import type { KifuRecord } from '../types/kifuRecord';
import { MoveEvaluation } from '../types/shogi';
import { idbGet, idbSet } from './idbKeyVal';

export const MAX_CACHED_PAYLOADS = 15;
const PAYLOAD_KEY_PREFIX = 'joseki_tree_kifu_payload:';
const LRU_INDEX_KEY = 'joseki_tree_kifu_payload_lru';

export interface CachedKifuPayload {
  id: string;
  jkfJson: string;
  rawKif?: string;
  evaluations?: Record<number, MoveEvaluation>;
  updatedAt: string;
  analysisEngineId?: string;
}

interface LruEntry {
  id: string;
  cachedAt: number;
  dirty?: boolean;
}

function payloadKey(id: string): string {
  return `${PAYLOAD_KEY_PREFIX}${id}`;
}

async function loadLruIndex(): Promise<LruEntry[]> {
  const list = await idbGet<LruEntry[]>(LRU_INDEX_KEY);
  return Array.isArray(list) ? list : [];
}

async function saveLruIndex(entries: LruEntry[]): Promise<void> {
  await idbSet(LRU_INDEX_KEY, entries);
}

/** Reads a cached payload by record id and bumps its LRU timestamp. */
export async function getCachedKifuPayload(
  id: string
): Promise<CachedKifuPayload | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const payload = await idbGet<CachedKifuPayload>(payloadKey(id));
    if (!payload) return null;
    const lru = await loadLruIndex();
    const idx = lru.findIndex((e) => e.id === id);
    if (idx >= 0) {
      lru[idx] = { ...lru[idx]!, cachedAt: Date.now() };
      await saveLruIndex(lru);
    }
    return payload;
  } catch (err) {
    console.warn('[KifuPayloadCache] get failed:', err);
    return null;
  }
}

/**
 * Stores a record's heavy payload in IndexedDB and evicts the oldest
 * non-dirty entries beyond MAX_CACHED_PAYLOADS.
 */
export async function putCachedKifuPayload(
  record: Pick<
    KifuRecord,
    'id' | 'jkfJson' | 'rawKif' | 'evaluations' | 'updatedAt' | 'analysisEngineId'
  >,
  options: { dirty?: boolean } = {}
): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  if (!record.jkfJson || record.jkfJson === '{}') return;
  try {
    const payload: CachedKifuPayload = {
      id: record.id,
      jkfJson: record.jkfJson,
      ...(record.rawKif ? { rawKif: record.rawKif } : {}),
      ...(record.evaluations ? { evaluations: record.evaluations } : {}),
      updatedAt: record.updatedAt,
      ...(record.analysisEngineId ? { analysisEngineId: record.analysisEngineId } : {}),
    };
    await idbSet(payloadKey(record.id), payload);

    const lru = await loadLruIndex();
    const existing = lru.find((e) => e.id === record.id);
    const nextDirty = options.dirty ?? existing?.dirty ?? false;
    const filtered = lru.filter((e) => e.id !== record.id);
    filtered.push({ id: record.id, cachedAt: Date.now(), dirty: nextDirty });

    // Evict oldest clean entries if clean count exceeds MAX_CACHED_PAYLOADS.
    const cleanEntries = filtered.filter((e) => !e.dirty);
    if (cleanEntries.length > MAX_CACHED_PAYLOADS) {
      cleanEntries.sort((a, b) => a.cachedAt - b.cachedAt);
      const evictCount = cleanEntries.length - MAX_CACHED_PAYLOADS;
      const toEvict = new Set(cleanEntries.slice(0, evictCount).map((e) => e.id));
      for (const id of toEvict) {
        await idbSet(payloadKey(id), undefined);
      }
      await saveLruIndex(filtered.filter((e) => !toEvict.has(e.id)));
    } else {
      await saveLruIndex(filtered);
    }
  } catch (err) {
    console.warn('[KifuPayloadCache] put failed:', err);
  }
}

/** Marks a cached payload as synced so it becomes eligible for LRU eviction. */
export async function markCachedPayloadSynced(id: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const lru = await loadLruIndex();
    const idx = lru.findIndex((e) => e.id === id);
    if (idx >= 0 && lru[idx]!.dirty) {
      lru[idx] = { ...lru[idx]!, dirty: false };
      await saveLruIndex(lru);
    }
  } catch (err) {
    console.warn('[KifuPayloadCache] markSynced failed:', err);
  }
}

/** Removes a record's cached payload and LRU entry from IndexedDB. */
export async function deleteCachedKifuPayload(id: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    await idbSet(payloadKey(id), undefined);
    const lru = await loadLruIndex();
    const filtered = lru.filter((e) => e.id !== id);
    if (filtered.length !== lru.length) {
      await saveLruIndex(filtered);
    }
  } catch (err) {
    console.warn('[KifuPayloadCache] delete failed:', err);
  }
}

/** Strips heavy payload fields from a KifuRecord, keeping metadata + openingLine. */
export function toMetadataOnlyRecord(record: KifuRecord): KifuRecord {
  const { evaluations: _evals, rawKif: _raw, positionSfens: _sfens, ...rest } = record;
  return {
    ...rest,
    jkfJson: '{}',
  };
}
