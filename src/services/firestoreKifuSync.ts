/**
 * Firestore Kifu Sync Service (Issue #42e).
 * Synchronizes the unified local KifuRecord store with the user's private
 * Firestore cloud storage:
 *   /users/{userId}/games/{gameId}
 *
 * All KifuRecord sources (studio / tree / import) sync bidirectionally.
 * Documents carry `recordSchema: 1`; legacy SavedStudioGame documents are
 * converted on pull and rewritten in the new schema (one-time migration).
 *
 * Provides bidirectional sync:
 * - Automatically pushes new/updated local records to Firestore when signed in.
 * - Pulls records created/updated on other devices (PC <-> Mobile).
 * - Maintains offline-first fallback in localStorage.
 *
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import {
  collection,
  doc,
  getDoc,
  setDoc,
  getDocs,
  deleteDoc,
  writeBatch,
  query,
  where,
} from 'firebase/firestore/lite';
import { getDb } from './firebase';

const getActiveDb = () => getDb();
import { ShogiPlayerProfile } from '../types/player';
import type { FreeBoardDiagram } from '../types/freeBoardDiagram';
import type { TacticalQuizCard } from '../types/quiz';
import type { TacticsNoteItem } from '../types/tacticsNote';
import type { TsumegoProblem } from '../types/tsumego';
import {
  clearDeletedDiagramId,
  loadDeletedDiagramIds,
  loadFreeBoardDiagrams,
  saveFreeBoardDiagrams,
} from '../utils/freeBoardDiagramStorage';
import {
  CLOUD_ANALYSIS_LEVEL_NODES,
  CloudAnalysisLevel,
  KifuRecord,
} from '../types/kifuRecord';
import {
  isGenericPlaceholderPlayerName,
  loadPlayerProfiles,
  purgeGenericPlaceholderPlayers,
  resolveOrRegisterPlayer,
  savePlayerProfiles,
} from '../utils/playerStorage';
import {
  clearDeletedQuizId,
  loadDeletedQuizIds,
  loadQuizPool,
  saveQuizPool,
} from '../utils/quizPoolStorage';
import {
  clearDeletedTacticId,
  loadDeletedTacticIds,
  loadTacticsItems,
  saveAllTacticsItems,
} from '../utils/tacticsStorage';
import {
  clearDeletedTsumegoId,
  loadDeletedTsumegoIds,
  loadImportedTsumegoHashes,
  loadTsumegoProblems,
  saveImportedTsumegoHashes,
  saveTsumegoProblems,
} from '../utils/tsumegoStorage';
import {
  loadKifuRecords,
  saveKifuRecords,
  saveKifuRecord,
  getKifuRecord,
  loadDeletedKifuIds,
} from '../utils/kifuRecordStorage';
import {
  getCachedKifuPayload,
  markCachedPayloadSynced,
  putCachedKifuPayload,
} from '../utils/kifuPayloadCache';
import {
  firestoreDocToKifuRecord,
  kifuRecordToFirestoreDoc,
} from '../utils/kifuRecordCodec';
import { computeKifuPositionSfens } from '../utils/kifuPositionSfens';
import { getSafeStorage } from '../utils/matchHistoryStorage';

/** Timeout for a single Firestore network operation (ms). */
const FIRESTORE_OP_TIMEOUT_MS = 15000;

export type SyncCollectionKey =
  | 'games'
  | 'players'
  | 'tactics'
  | 'tsumego'
  | 'quizzes'
  | 'diagrams';

export interface CloudSyncOptions {
  /** 'auto' enforces cooldown for background/mount triggers; 'manual' bypasses cooldown. */
  mode?: 'auto' | 'manual';
  /** When true, bypasses incremental updatedAt cursors and performs a full collection scan. */
  forceFull?: boolean;
}

export const SYNC_CURSORS_STORAGE_KEY = 'joseki_tree_sync_cursors_v1';
export const AUTO_FULL_SYNC_COOLDOWN_MS = 5 * 60 * 1000;
export const AUTO_TACTICS_SYNC_COOLDOWN_MS = 2 * 60 * 1000;
const PULL_CURSOR_SKEW_BUFFER_MS = 5000;

interface CollectionSyncCursor {
  pullCursor: string;
  pushCursor: string;
  syncedAt?: string;
}

type SyncCursorMap = Record<
  string,
  Partial<Record<SyncCollectionKey, CollectionSyncCursor>>
>;

const lastFullSyncByUser = new Map<string, number>();
const lastTacticsSyncByUser = new Map<string, number>();
const inFlightFullSync = new Map<
  string,
  Promise<{ pulled: number; pushed: number; migrated: number }>
>();
const inFlightTacticsSync = new Map<
  string,
  Promise<{ pulled: number; pushed: number }>
>();

function isoTimeMs(iso?: string): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
}

function computePullCursor(syncStartedAtMs: number): string {
  return new Date(syncStartedAtMs - PULL_CURSOR_SKEW_BUFFER_MS).toISOString();
}

function readAllSyncCursors(): SyncCursorMap {
  try {
    const raw = getSafeStorage().getItem(SYNC_CURSORS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as SyncCursorMap;
  } catch {
    return {};
  }
}

function getCollectionCursor(
  userId: string,
  key: SyncCollectionKey
): CollectionSyncCursor | null {
  if (!userId) return null;
  const all = readAllSyncCursors();
  const entry = all[userId]?.[key];
  if (
    entry &&
    typeof entry.pullCursor === 'string' &&
    entry.pullCursor.length > 0 &&
    typeof entry.pushCursor === 'string' &&
    entry.pushCursor.length > 0
  ) {
    return entry;
  }
  return null;
}

function setCollectionCursor(
  userId: string,
  key: SyncCollectionKey,
  cursor: CollectionSyncCursor
): void {
  if (!userId) return;
  try {
    const all = readAllSyncCursors();
    const userEntry = all[userId] ?? {};
    all[userId] = { ...userEntry, [key]: cursor };
    getSafeStorage().setItem(SYNC_CURSORS_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // best-effort only
  }
}

/**
 * Clears persisted incremental sync cursors and cooldown state.
 * Useful in unit tests or when forcing a full-collection reconciliation.
 */
export function clearSyncCursors(userId?: string): void {
  try {
    if (userId) {
      const all = readAllSyncCursors();
      delete all[userId];
      getSafeStorage().setItem(SYNC_CURSORS_STORAGE_KEY, JSON.stringify(all));
      lastFullSyncByUser.delete(userId);
      lastTacticsSyncByUser.delete(userId);
      const last = getLastSyncInfo();
      if (last?.userId === userId) {
        getSafeStorage().removeItem(LAST_SYNC_STORAGE_KEY);
      }
      return;
    }
    getSafeStorage().removeItem(SYNC_CURSORS_STORAGE_KEY);
    getSafeStorage().removeItem(LAST_SYNC_STORAGE_KEY);
    lastFullSyncByUser.clear();
    lastTacticsSyncByUser.clear();
  } catch {
    // best-effort only
  }
}

/**
 * Races a Firestore promise against a timeout so the UI never hangs forever
 * (pending writes never settle while the client cannot reach the backend).
 */
function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`[FirestoreSync] ${label} timed out after ${FIRESTORE_OP_TIMEOUT_MS}ms`));
    }, FIRESTORE_OP_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Ensures a KifuRecord has its full payload (jkfJson, rawKif, evaluations).
 * Checks in-memory/local metadata -> IndexedDB LRU cache -> Firestore single-doc fetch.
 */
export async function ensureKifuRecordPayload(
  userId: string | undefined,
  recordId: string
): Promise<KifuRecord | null> {
  const meta = getKifuRecord(recordId);
  if (!meta) return null;
  if (meta.jkfJson && meta.jkfJson !== '{}') {
    return meta;
  }

  const cached = await getCachedKifuPayload(recordId);
  if (
    cached &&
    cached.updatedAt === meta.updatedAt &&
    cached.analysisEngineId === meta.analysisEngineId
  ) {
    return {
      ...meta,
      jkfJson: cached.jkfJson,
      rawKif: cached.rawKif,
      evaluations: cached.evaluations,
    };
  }

  const db = getActiveDb();
  if (db && userId) {
    try {
      const gameDocRef = doc(db, 'users', userId, 'games', recordId);
      const snap = await withTimeout(getDoc(gameDocRef), 'getDoc');
      if (snap.exists()) {
        const decoded = firestoreDocToKifuRecord(snap.data(), snap.id);
        if (decoded) {
          await putCachedKifuPayload(decoded.record, { dirty: false });
          return decoded.record;
        }
      }
    } catch (err) {
      console.warn(`[FirestoreSync] Failed to lazy-fetch record ${recordId}:`, err);
    }
  }

  if (cached) {
    return {
      ...meta,
      jkfJson: cached.jkfJson,
      rawKif: cached.rawKif,
      evaluations: cached.evaluations,
    };
  }
  if (!meta.jkfJson || meta.jkfJson === '{}') {
    console.warn(`[FirestoreSync] Payload unavailable for record ${recordId} (jkfJson is empty)`);
  }
  return meta;
}

/**
 * Uploads a single KifuRecord (or record id resolved from local storage)
 * to the user's Firestore collection. Returns true when Firestore write succeeds.
 */
export async function uploadKifuRecordToFirestore(
  userId: string,
  recordOrId: string | KifuRecord
): Promise<boolean> {
  const db = getActiveDb();
  if (!db || !userId) return false;
  let record = typeof recordOrId === 'string' ? getKifuRecord(recordOrId) : recordOrId;
  if (!record) return false;
  if (!record.jkfJson || record.jkfJson === '{}') {
    const cached = await getCachedKifuPayload(record.id);
    if (cached) {
      record = {
        ...record,
        jkfJson: cached.jkfJson,
        rawKif: cached.rawKif ?? record.rawKif,
        evaluations: cached.evaluations ?? record.evaluations,
      };
    }
  }
  try {
    const gameDocRef = doc(db, 'users', userId, 'games', record.id);
    await withTimeout(
      setDoc(gameDocRef, kifuRecordToFirestoreDoc(record), { merge: true }),
      'setDoc'
    );
    await markCachedPayloadSynced(record.id);
    return true;
  } catch (err) {
    console.warn(`[FirestoreSync] Failed to upload record ${record.id}:`, err);
    return false;
  }
}

export const CLOUD_ANALYSIS_ENGINE_ID = 'yaneuraou';

/**
 * Returns true when the record has already been analyzed by the cloud engine.
 */
export function isCloudAnalyzedRecord(
  record: Pick<KifuRecord, 'analysisStatus' | 'analysisEngineId'>
): boolean {
  return (
    record.analysisStatus === 'completed' &&
    record.analysisEngineId === CLOUD_ANALYSIS_ENGINE_ID
  );
}

export interface QueueCloudAnalysisOptions {
  /** Allow re-queueing records already completed by the cloud engine. */
  forceReanalyze?: boolean;
  /** Cloud search budget preset ('light' | 'standard' | 'deep'). */
  level?: CloudAnalysisLevel;
}

/**
 * Returns true when a KifuRecord is eligible to be queued for cloud analysis.
 * Records analyzed only by local browser engines are eligible because the
 * cloud engine (YaneuraOu + Suisho NNUE) is stronger and overwrites local results.
 */
export function canQueueRecordForCloudAnalysis(
  record: Pick<KifuRecord, 'analysisStatus' | 'analysisEngineId'>,
  options: { allowReanalyze?: boolean } = {}
): boolean {
  if (record.analysisStatus === 'queued' || record.analysisStatus === 'processing') {
    return false;
  }
  if (!options.allowReanalyze && isCloudAnalyzedRecord(record)) {
    return false;
  }
  return true;
}

/**
 * Marks a KifuRecord as queued for cloud analysis (#59) and uploads the
 * updated doc so the GitHub Actions worker can claim it. Clears any stale
 * claim/error fields so a re-queued record is claimable immediately.
 */
export async function queueKifuRecordForCloudAnalysis(
  userId: string,
  recordId: string,
  options: QueueCloudAnalysisOptions = {}
): Promise<boolean> {
  const record = await ensureKifuRecordPayload(userId, recordId);
  if (!record) return false;
  if (!canQueueRecordForCloudAnalysis(record, { allowReanalyze: options.forceReanalyze })) {
    return false;
  }
  // Generate the per-ply SFEN list now (queue time) so the cloud worker
  // stays a thin USI client (#59). Without sfens the record is not analyzable.
  const positionSfens = computeKifuPositionSfens(record);
  if (!positionSfens) {
    console.warn(`[FirestoreSync] Cannot compute position SFENs for record ${recordId}; not queued.`);
    return false;
  }
  const targetNodes = CLOUD_ANALYSIS_LEVEL_NODES[options.level ?? 'standard'];
  const now = new Date().toISOString();
  const queuedLocal: KifuRecord = {
    ...record,
    analysisStatus: 'queued',
    analysisJobId: undefined,
    analysisClaimedAt: undefined,
    analysisError: undefined,
    analysisTargetNodes: targetNodes,
    analysisForceReanalyze: options.forceReanalyze ? true : undefined,
    // Keep positionSfens out of localStorage to avoid QuotaExceededError on bulk queues.
    positionSfens: undefined,
    analysisQueuePosition: undefined,
    updatedAt: now,
  };
  const queuedCloud: KifuRecord = {
    ...queuedLocal,
    positionSfens,
  };
  saveKifuRecord(queuedLocal);
  return await uploadKifuRecordToFirestore(userId, queuedCloud);
}

/**
 * Removes a game document from the user's Firestore collection.
 */
export async function deleteKifuRecordFromFirestore(
  userId: string,
  gameId: string
): Promise<boolean> {
  const db = getActiveDb();
  if (!db || !userId) return false;
  try {
    const gameDocRef = doc(db, 'users', userId, 'games', gameId);
    await withTimeout(deleteDoc(gameDocRef), 'deleteDoc');
    return true;
  } catch (err) {
    console.warn(`[FirestoreSync] Failed to delete record ${gameId}:`, err);
    return false;
  }
}

/**
 * Decides whether a remote Firestore record should overwrite the local copy.
 * Cloud-completed (`yaneuraou`) results and active `processing` transitions
 * always take precedence over stale local non-cloud records, even if local
 * metadata (`updatedAt`) was touched more recently.
 */
export function shouldPreferRemoteRecord(
  local:
    | Pick<KifuRecord, 'updatedAt' | 'analysisStatus' | 'analysisEngineId' | 'analysisForceReanalyze'>
    | undefined,
  remote: Pick<KifuRecord, 'updatedAt' | 'analysisStatus' | 'analysisEngineId'>
): boolean {
  if (!local) return true;
  const localTime = new Date(local.updatedAt).getTime();
  const remoteTime = new Date(remote.updatedAt).getTime();
  // Do not revert a newer local forced re-analysis request back to stale completed cloud state.
  if (
    local.analysisStatus === 'queued' &&
    local.analysisForceReanalyze &&
    remote.analysisStatus === 'completed' &&
    localTime > remoteTime
  ) {
    return false;
  }
  if (isCloudAnalyzedRecord(remote) && !isCloudAnalyzedRecord(local)) {
    return true;
  }
  if (remote.analysisStatus === 'processing' && local.analysisStatus === 'queued') {
    return true;
  }
  return remoteTime > localTime;
}

type CloudRecordInfo = {
  updatedAt: string;
  analysisStatus?: KifuRecord['analysisStatus'];
  analysisEngineId?: string;
};

export interface CloudPullResult {
  pulled: number;
  /** Number of legacy-schema docs converted and rewritten this sync. */
  migrated: number;
}

interface PullGamesInternalResult extends CloudPullResult {
  cloudRecordMap: Map<string, CloudRecordInfo>;
  syncStartedAtMs: number;
  pushCursor: string | null;
}

/**
 * Fetches game documents from the user's cloud collection (incremental via
 * updatedAt cursor when available) and merges them into the local KifuRecord store.
 * Returns the cloud snapshot index so upload reconciliation avoids a second getDocs.
 */
async function pullCloudRecordsToLocal(
  userId: string,
  options?: CloudSyncOptions
): Promise<PullGamesInternalResult> {
  const db = getActiveDb();
  const syncStartedAtMs = Date.now();
  if (!db || !userId) {
    return {
      pulled: 0,
      migrated: 0,
      cloudRecordMap: new Map(),
      syncStartedAtMs,
      pushCursor: null,
    };
  }
  try {
    const cursor = options?.forceFull ? null : getCollectionCursor(userId, 'games');
    const gamesCol = collection(db, 'users', userId, 'games');
    const gamesTarget = cursor
      ? query(gamesCol, where('updatedAt', '>', cursor.pullCursor))
      : gamesCol;
    const snapshot = await withTimeout(getDocs(gamesTarget), 'getDocs(games)');
    const localRecords = loadKifuRecords();
    const localMap = new Map<string, KifuRecord>(localRecords.map((r) => [r.id, r]));
    const deletedIds = new Set(loadDeletedKifuIds());

    const cloudRecordMap = new Map<string, CloudRecordInfo>();
    const updates = new Map<string, KifuRecord>();
    const legacyRewrites: Array<{ id: string; data: Record<string, unknown> }> = [];
    let pulled = 0;
    let migrated = 0;

    snapshot.forEach((d) => {
      const rawData = d.data() as {
        updatedAt?: string;
        analysisStatus?: KifuRecord['analysisStatus'];
        analysisEngineId?: string;
      };
      if (rawData && typeof rawData.updatedAt === 'string') {
        cloudRecordMap.set(d.id, {
          updatedAt: rawData.updatedAt,
          analysisStatus: rawData.analysisStatus,
          analysisEngineId: rawData.analysisEngineId,
        });
      }
      if (deletedIds.has(d.id)) return;
      const decoded = firestoreDocToKifuRecord(d.data(), d.id);
      if (!decoded) return;
      const { record, wasLegacy } = decoded;
      if (deletedIds.has(record.id)) return;

      const local = localMap.get(record.id) ?? updates.get(record.id);
      const remoteNewer = shouldPreferRemoteRecord(local, record);

      if (remoteNewer) {
        // Strip transient positionSfens before persisting locally.
        const localCopy: KifuRecord = record.positionSfens
          ? { ...record, positionSfens: undefined }
          : record;
        updates.set(record.id, localCopy);
        pulled++;
      }

      if (wasLegacy) {
        migrated++;
        // Rewrite the doc in the new schema. When local data is newer,
        // the canonical local record is uploaded instead of stale cloud data.
        const canonical = remoteNewer ? record : (local as KifuRecord);
        legacyRewrites.push({ id: d.id, data: kifuRecordToFirestoreDoc(canonical) });
        cloudRecordMap.set(d.id, {
          updatedAt: canonical.updatedAt,
          analysisStatus: canonical.analysisStatus,
          analysisEngineId: canonical.analysisEngineId,
        });
      }
    });

    // Persist pulled/updated records in one write.
    if (updates.size > 0) {
      const merged = localRecords.map((r) => updates.get(r.id) ?? r);
      const existingIds = new Set(localRecords.map((r) => r.id));
      for (const [id, rec] of updates) {
        if (!existingIds.has(id)) merged.push(rec);
      }
      saveKifuRecords(merged, { fromCloud: true });
    }

    // Rewrite legacy docs to the unified schema (cloud one-time migration).
    if (legacyRewrites.length > 0) {
      const batch = writeBatch(db);
      for (const rw of legacyRewrites) {
        batch.set(doc(db, 'users', userId, 'games', rw.id), rw.data);
      }
      await withTimeout(batch.commit(), 'batch.commit(migrate)');
    }

    return {
      pulled,
      migrated,
      cloudRecordMap,
      syncStartedAtMs,
      pushCursor: cursor?.pushCursor ?? null,
    };
  } catch (err) {
    console.warn('[FirestoreSync] Error pulling cloud records:', err);
    throw err;
  }
}

/**
 * Uploads local KifuRecords that are missing (full scan) or newer than Firestore,
 * reusing the snapshot map collected during pullCloudRecordsToLocal (zero extra reads).
 */
async function syncLocalRecordsToCloud(
  userId: string,
  pullContext: PullGamesInternalResult
): Promise<number> {
  const db = getActiveDb();
  if (!db || !userId) return 0;
  try {
    const localRecords = loadKifuRecords();
    if (localRecords.length === 0) return 0;

    const pushCursorMs = pullContext.pushCursor
      ? isoTimeMs(pullContext.pushCursor)
      : null;

    const batch = writeBatch(db);
    let count = 0;
    const uploadedIds: string[] = [];

    for (const rec of localRecords) {
      const cloudInfo = pullContext.cloudRecordMap.get(rec.id);
      if (cloudInfo) {
        // Never overwrite cloud-completed (yaneuraou) or active processing docs with stale local data.
        if (isCloudAnalyzedRecord(cloudInfo) && !isCloudAnalyzedRecord(rec)) {
          continue;
        }
        if (cloudInfo.analysisStatus === 'processing' && rec.analysisStatus === 'queued') {
          continue;
        }
      } else if (pushCursorMs !== null && isoTimeMs(rec.updatedAt) <= pushCursorMs) {
        // Incremental sync: older local records were already synchronized in a prior run.
        continue;
      }
      // Upload if missing on cloud (full sync) or local updatedAt is newer
      if (!cloudInfo || new Date(rec.updatedAt) > new Date(cloudInfo.updatedAt)) {
        let toUpload = rec;
        if (!toUpload.jkfJson || toUpload.jkfJson === '{}') {
          const cached = await getCachedKifuPayload(toUpload.id);
          if (cached) {
            toUpload = {
              ...toUpload,
              jkfJson: cached.jkfJson,
              rawKif: cached.rawKif ?? toUpload.rawKif,
              evaluations: cached.evaluations ?? toUpload.evaluations,
            };
          }
        }
        const payload = kifuRecordToFirestoreDoc(toUpload);
        // Never overwrite an existing cloud jkfJson with an empty metadata placeholder.
        if (cloudInfo && (!toUpload.jkfJson || toUpload.jkfJson === '{}')) {
          delete payload.jkfJson;
        }
        const docRef = doc(db, 'users', userId, 'games', rec.id);
        batch.set(docRef, payload, { merge: true });
        uploadedIds.push(rec.id);
        count++;
      }
    }

    if (count > 0) {
      await withTimeout(batch.commit(), 'batch.commit');
      for (const id of uploadedIds) {
        await markCachedPayloadSynced(id);
      }
    }
    return count;
  } catch (err) {
    console.warn('[FirestoreSync] Error syncing local records to cloud:', err);
    throw err;
  }
}

/** Uploads a single player profile to /users/{userId}/players/{id}. */
export async function uploadPlayerToFirestore(
  userId: string,
  profile: ShogiPlayerProfile
): Promise<void> {
  const db = getActiveDb();
  if (!db || !userId) return;
  try {
    const ref = doc(db, 'users', userId, 'players', profile.id);
    const stamped: ShogiPlayerProfile = {
      ...profile,
      updatedAt: profile.updatedAt || profile.createdAt || new Date().toISOString(),
    };
    const sanitized = JSON.parse(JSON.stringify(stamped));
    await withTimeout(setDoc(ref, sanitized), 'setDoc(player)');
  } catch (err) {
    console.warn(`[FirestoreSync] Failed to upload player ${profile.id}:`, err);
  }
}

/** Removes a player profile from the cloud. */
export async function deletePlayerFromFirestore(
  userId: string,
  playerId: string
): Promise<void> {
  const db = getActiveDb();
  if (!db || !userId) return;
  try {
    const ref = doc(db, 'users', userId, 'players', playerId);
    await withTimeout(deleteDoc(ref), 'deleteDoc(player)');
  } catch (err) {
    console.warn(`[FirestoreSync] Failed to delete player ${playerId}:`, err);
  }
}

/**
 * Bidirectional player profile sync (last-write-wins by updatedAt).
 * Uses incremental updatedAt query after the initial full scan.
 */
export async function syncPlayersWithCloud(
  userId: string,
  options?: CloudSyncOptions
): Promise<{ pulled: number; pushed: number }> {
  const db = getActiveDb();
  if (!db || !userId) return { pulled: 0, pushed: 0 };
  const syncStartedAtMs = Date.now();
  const cursor = options?.forceFull ? null : getCollectionCursor(userId, 'players');
  const col = collection(db, 'users', userId, 'players');
  const target = cursor
    ? query(col, where('updatedAt', '>', cursor.pullCursor))
    : col;
  const snapshot = await withTimeout(getDocs(target), 'getDocs(players)');
  const cloudMap = new Map<string, ShogiPlayerProfile>();
  snapshot.forEach((d) => {
    const data = d.data() as ShogiPlayerProfile;
    if (data && data.id) cloudMap.set(data.id, data);
  });

  const merged = new Map<string, ShogiPlayerProfile>(
    loadPlayerProfiles().map((p) => [p.id, p])
  );
  const toPush: ShogiPlayerProfile[] = [];
  let pulled = 0;

  const pushCursorMs = cursor ? isoTimeMs(cursor.pushCursor) : null;
  const nowIso = new Date(syncStartedAtMs).toISOString();

  cloudMap.forEach((cloudP, id) => {
    const localP = merged.get(id);
    if (!localP || isoTimeMs(cloudP.updatedAt) > isoTimeMs(localP.updatedAt)) {
      merged.set(id, cloudP);
      pulled++;
    }
  });
  merged.forEach((localP, id) => {
    const cloudP = cloudMap.get(id);
    const localMs = isoTimeMs(localP.updatedAt || localP.createdAt);
    if (cloudP) {
      if (localMs > isoTimeMs(cloudP.updatedAt)) {
        toPush.push(localP.updatedAt ? localP : { ...localP, updatedAt: localP.createdAt || nowIso });
      }
    } else if (pushCursorMs === null || localMs > pushCursorMs) {
      toPush.push(localP.updatedAt ? localP : { ...localP, updatedAt: localP.createdAt || nowIso });
    }
  });

  if (pulled > 0) savePlayerProfiles(Array.from(merged.values()));
  if (toPush.length > 0) {
    const batch = writeBatch(db);
    for (const p of toPush) {
      batch.set(doc(db, 'users', userId, 'players', p.id), JSON.parse(JSON.stringify(p)));
    }
    await withTimeout(batch.commit(), 'batch.commit(players)');
  }
  setCollectionCursor(userId, 'players', {
    pullCursor: computePullCursor(syncStartedAtMs),
    pushCursor: nowIso,
    syncedAt: nowIso,
  });
  return { pulled, pushed: toPush.length };
}

function shouldPushItemByCursor(
  hasCloudItem: boolean,
  localUpdatedMs: number,
  cloudUpdatedMs: number,
  pushCursorMs: number | null
): boolean {
  if (hasCloudItem) {
    return localUpdatedMs > cloudUpdatedMs;
  }
  return pushCursorMs === null || localUpdatedMs > pushCursorMs;
}

function isWithinAutoTacticsCooldown(userId: string): boolean {
  const now = Date.now();
  const memTs = lastTacticsSyncByUser.get(userId);
  if (memTs !== undefined && now - memTs < AUTO_TACTICS_SYNC_COOLDOWN_MS) {
    return true;
  }
  const cursor = getCollectionCursor(userId, 'tactics');
  if (cursor?.syncedAt) {
    const ts = Date.parse(cursor.syncedAt);
    if (!Number.isNaN(ts) && now - ts < AUTO_TACTICS_SYNC_COOLDOWN_MS) {
      return true;
    }
  }
  return false;
}

/** Uploads a single tactics/note item to /users/{userId}/tactics/{id}. */
export async function uploadTacticToFirestore(
  userId: string,
  item: TacticsNoteItem
): Promise<void> {
  const db = getActiveDb();
  if (!db || !userId) return;
  try {
    const ref = doc(db, 'users', userId, 'tactics', item.id);
    const stamped: TacticsNoteItem = {
      ...item,
      updatedAt: item.updatedAt || new Date().toISOString(),
    };
    const sanitized = JSON.parse(JSON.stringify(stamped));
    await withTimeout(setDoc(ref, sanitized), 'setDoc(tactic)');
  } catch (err) {
    console.warn(`[FirestoreSync] Failed to upload tactic ${item.id}:`, err);
  }
}

/** Removes a tactics/note item from /users/{userId}/tactics/{id}. */
export async function deleteTacticFromFirestore(
  userId: string,
  tacticId: string
): Promise<void> {
  const db = getActiveDb();
  if (!db || !userId) return;
  try {
    const ref = doc(db, 'users', userId, 'tactics', tacticId);
    await withTimeout(deleteDoc(ref), 'deleteDoc(tactic)');
    clearDeletedTacticId(tacticId);
  } catch (err) {
    console.warn(`[FirestoreSync] Failed to delete tactic ${tacticId}:`, err);
  }
}

async function executeSyncTacticsWithCloud(
  userId: string,
  options?: CloudSyncOptions
): Promise<{ pulled: number; pushed: number }> {
  const db = getActiveDb();
  if (!db || !userId) return { pulled: 0, pushed: 0 };

  const pendingDeletes = loadDeletedTacticIds();
  if (pendingDeletes.length > 0) {
    await Promise.all(
      pendingDeletes.map((id) => deleteTacticFromFirestore(userId, id))
    );
  }
  const stillPendingDeletes = new Set(loadDeletedTacticIds());

  const syncStartedAtMs = Date.now();
  const cursor = options?.forceFull ? null : getCollectionCursor(userId, 'tactics');
  const col = collection(db, 'users', userId, 'tactics');
  const target = cursor
    ? query(col, where('updatedAt', '>', cursor.pullCursor))
    : col;
  const snapshot = await withTimeout(getDocs(target), 'getDocs(tactics)');
  const cloudMap = new Map<string, TacticsNoteItem>();
  snapshot.forEach((d) => {
    const data = d.data() as TacticsNoteItem;
    if (data && data.id && !stillPendingDeletes.has(data.id)) {
      cloudMap.set(data.id, data);
    }
  });

  const merged = new Map<string, TacticsNoteItem>(
    loadTacticsItems().map((item) => [item.id, item])
  );
  const toPush: TacticsNoteItem[] = [];
  let pulled = 0;

  const pushCursorMs = cursor ? isoTimeMs(cursor.pushCursor) : null;
  const nowIso = new Date(syncStartedAtMs).toISOString();

  cloudMap.forEach((cloudItem, id) => {
    const localItem = merged.get(id);
    if (!localItem || isoTimeMs(cloudItem.updatedAt) > isoTimeMs(localItem.updatedAt)) {
      merged.set(id, cloudItem);
      pulled++;
    }
  });

  merged.forEach((localItem, id) => {
    if (!localItem.isCustom) return;
    const cloudItem = cloudMap.get(id);
    if (
      shouldPushItemByCursor(
        cloudItem !== undefined,
        isoTimeMs(localItem.updatedAt),
        isoTimeMs(cloudItem?.updatedAt),
        pushCursorMs
      )
    ) {
      toPush.push(localItem.updatedAt ? localItem : { ...localItem, updatedAt: nowIso });
    }
  });

  if (pulled > 0) {
    saveAllTacticsItems(Array.from(merged.values()));
  }
  if (toPush.length > 0) {
    const batch = writeBatch(db);
    for (const item of toPush) {
      batch.set(
        doc(db, 'users', userId, 'tactics', item.id),
        JSON.parse(JSON.stringify(item))
      );
    }
    await withTimeout(batch.commit(), 'batch.commit(tactics)');
  }

  lastTacticsSyncByUser.set(userId, Date.now());
  setCollectionCursor(userId, 'tactics', {
    pullCursor: computePullCursor(syncStartedAtMs),
    pushCursor: nowIso,
    syncedAt: nowIso,
  });

  return { pulled, pushed: toPush.length };
}

/**
 * Bidirectional tactics & study notes sync (/users/{userId}/tactics).
 * Uses incremental updatedAt queries after initial full scan and enforces
 * cooldown + in-flight deduplication for automatic mount syncs.
 */
export async function syncTacticsWithCloud(
  userId: string,
  options?: CloudSyncOptions
): Promise<{ pulled: number; pushed: number }> {
  const db = getActiveDb();
  if (!db || !userId) return { pulled: 0, pushed: 0 };

  if (
    options?.mode === 'auto' &&
    !options.forceFull &&
    isWithinAutoTacticsCooldown(userId)
  ) {
    return { pulled: 0, pushed: 0 };
  }

  const existing = inFlightTacticsSync.get(userId);
  if (existing && !options?.forceFull) {
    return existing;
  }

  const task = executeSyncTacticsWithCloud(userId, options).finally(() => {
    if (inFlightTacticsSync.get(userId) === task) {
      inFlightTacticsSync.delete(userId);
    }
  });
  inFlightTacticsSync.set(userId, task);
  return task;
}

function toFirestoreDocId(id: string): string {
  return id.replace(/\//g, '__');
}

function getTsumegoUpdatedMs(problem: TsumegoProblem): number {
  if (problem.updatedAt) {
    const ms = Date.parse(problem.updatedAt);
    if (!Number.isNaN(ms)) return ms;
  }
  return problem.createdAt || 0;
}

function getQuizUpdatedMs(card: TacticalQuizCard): number {
  const iso = card.updatedAt || card.createdAt;
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
}

/** Uploads a single tsumego problem to /users/{userId}/tsumego/{docId}. */
export async function uploadTsumegoToFirestore(
  userId: string,
  problem: TsumegoProblem
): Promise<void> {
  const db = getActiveDb();
  if (!db || !userId) return;
  try {
    const ref = doc(db, 'users', userId, 'tsumego', toFirestoreDocId(problem.id));
    const stamped: TsumegoProblem = {
      ...problem,
      updatedAt:
        problem.updatedAt ||
        (problem.createdAt ? new Date(problem.createdAt).toISOString() : new Date().toISOString()),
    };
    const sanitized = JSON.parse(JSON.stringify(stamped));
    await withTimeout(setDoc(ref, sanitized), 'setDoc(tsumego)');
  } catch (err) {
    console.warn(`[FirestoreSync] Failed to upload tsumego ${problem.id}:`, err);
  }
}

/** Uploads multiple tsumego problems to /users/{userId}/tsumego in batches. */
export async function uploadTsumegoBatchToFirestore(
  userId: string,
  problems: TsumegoProblem[]
): Promise<void> {
  const db = getActiveDb();
  if (!db || !userId || problems.length === 0) return;
  try {
    const nowIso = new Date().toISOString();
    const CHUNK = 400;
    for (let i = 0; i < problems.length; i += CHUNK) {
      const slice = problems.slice(i, i + CHUNK);
      const batch = writeBatch(db);
      for (const p of slice) {
        const stamped: TsumegoProblem = {
          ...p,
          updatedAt:
            p.updatedAt || (p.createdAt ? new Date(p.createdAt).toISOString() : nowIso),
        };
        batch.set(
          doc(db, 'users', userId, 'tsumego', toFirestoreDocId(p.id)),
          JSON.parse(JSON.stringify(stamped))
        );
      }
      await withTimeout(batch.commit(), 'batch.commit(tsumego)');
    }
  } catch (err) {
    console.warn('[FirestoreSync] Failed to batch upload tsumego:', err);
  }
}

/** Removes a tsumego problem from /users/{userId}/tsumego/{docId}. */
export async function deleteTsumegoFromFirestore(
  userId: string,
  problemId: string
): Promise<void> {
  const db = getActiveDb();
  if (!db || !userId) return;
  try {
    const ref = doc(db, 'users', userId, 'tsumego', toFirestoreDocId(problemId));
    await withTimeout(deleteDoc(ref), 'deleteDoc(tsumego)');
    clearDeletedTsumegoId(problemId);
  } catch (err) {
    console.warn(`[FirestoreSync] Failed to delete tsumego ${problemId}:`, err);
  }
}

/**
 * Bidirectional union-sync of previously imported SFEN hashes (/users/{userId}/meta/tsumego_import_history).
 */
export async function syncTsumegoImportHistoryWithCloud(
  userId: string
): Promise<void> {
  const db = getActiveDb();
  if (!db || !userId) return;

  try {
    const ref = doc(db, 'users', userId, 'meta', 'tsumego_import_history');
    const snap = await withTimeout(
      getDoc(ref),
      'getDoc(tsumego_import_history)'
    );
    const data = snap.exists()
      ? (snap.data() as { hashes?: unknown })
      : undefined;
    const remoteHashes = Array.isArray(data?.hashes)
      ? data.hashes.filter(
          (h): h is string => typeof h === 'string' && h.length > 0
        )
      : [];

    const localHashes = loadImportedTsumegoHashes();
    const mergedSet = new Set<string>([...localHashes, ...remoteHashes]);
    if (mergedSet.size === 0) return;

    const merged = Array.from(mergedSet);
    if (merged.length > localHashes.length) {
      saveImportedTsumegoHashes(merged);
    }

    if (merged.length > remoteHashes.length || (!snap.exists() && merged.length > 0)) {
      await withTimeout(
        setDoc(ref, {
          hashes: merged,
          updatedAt: new Date().toISOString(),
        }),
        'setDoc(tsumego_import_history)'
      );
    }
  } catch (err) {
    console.warn('[FirestoreSync] Failed syncing tsumego import history:', err);
  }
}

/**
 * Bidirectional tsumego sync (/users/{userId}/tsumego).
 * Flushes deletion tombstones first, then merges incrementally by updatedAt / createdAt.
 */
export async function syncTsumegoWithCloud(
  userId: string,
  options?: CloudSyncOptions
): Promise<{ pulled: number; pushed: number }> {
  const db = getActiveDb();
  if (!db || !userId) return { pulled: 0, pushed: 0 };

  const pendingDeletes = loadDeletedTsumegoIds();
  if (pendingDeletes.length > 0) {
    await Promise.all(
      pendingDeletes.map((id) => deleteTsumegoFromFirestore(userId, id))
    );
  }
  const stillPendingDeletes = new Set(loadDeletedTsumegoIds());

  const syncStartedAtMs = Date.now();
  const cursor = options?.forceFull ? null : getCollectionCursor(userId, 'tsumego');
  const col = collection(db, 'users', userId, 'tsumego');
  const target = cursor
    ? query(col, where('updatedAt', '>', cursor.pullCursor))
    : col;
  const snapshot = await withTimeout(getDocs(target), 'getDocs(tsumego)');
  const cloudMap = new Map<string, TsumegoProblem>();
  snapshot.forEach((d) => {
    const data = d.data() as TsumegoProblem;
    if (
      data &&
      typeof data.id === 'string' &&
      data.id.length > 0 &&
      data.source !== 'preset' &&
      !data.id.startsWith('seed-tsume-') &&
      !stillPendingDeletes.has(data.id)
    ) {
      cloudMap.set(data.id, data);
    }
  });

  const merged = new Map<string, TsumegoProblem>(
    loadTsumegoProblems().map((p) => [p.id, p])
  );
  const toPush: TsumegoProblem[] = [];
  let pulled = 0;

  const pushCursorMs = cursor ? isoTimeMs(cursor.pushCursor) : null;
  const nowIso = new Date(syncStartedAtMs).toISOString();

  cloudMap.forEach((cloudItem, id) => {
    const localItem = merged.get(id);
    if (!localItem || getTsumegoUpdatedMs(cloudItem) > getTsumegoUpdatedMs(localItem)) {
      merged.set(id, cloudItem);
      pulled++;
    }
  });

  merged.forEach((localItem, id) => {
    if (localItem.source === 'preset' || localItem.id.startsWith('seed-tsume-')) return;
    const cloudItem = cloudMap.get(id);
    if (
      shouldPushItemByCursor(
        cloudItem !== undefined,
        getTsumegoUpdatedMs(localItem),
        cloudItem ? getTsumegoUpdatedMs(cloudItem) : 0,
        pushCursorMs
      )
    ) {
      toPush.push(localItem);
    }
  });

  if (pulled > 0) {
    saveTsumegoProblems(Array.from(merged.values()));
  }
  if (toPush.length > 0) {
    await uploadTsumegoBatchToFirestore(userId, toPush);
  }

  await syncTsumegoImportHistoryWithCloud(userId);

  setCollectionCursor(userId, 'tsumego', {
    pullCursor: computePullCursor(syncStartedAtMs),
    pushCursor: nowIso,
    syncedAt: nowIso,
  });

  return { pulled, pushed: toPush.length };
}

/** Uploads a single quiz card to /users/{userId}/quizzes/{docId}. */
export async function uploadQuizCardToFirestore(
  userId: string,
  card: TacticalQuizCard
): Promise<void> {
  const db = getActiveDb();
  if (!db || !userId) return;
  try {
    const ref = doc(db, 'users', userId, 'quizzes', toFirestoreDocId(card.id));
    const stamped: TacticalQuizCard = {
      ...card,
      updatedAt: card.updatedAt || card.createdAt || new Date().toISOString(),
    };
    const sanitized = JSON.parse(JSON.stringify(stamped));
    await withTimeout(setDoc(ref, sanitized), 'setDoc(quiz)');
  } catch (err) {
    console.warn(`[FirestoreSync] Failed to upload quiz card ${card.id}:`, err);
  }
}

/** Uploads multiple quiz cards to /users/{userId}/quizzes in batches. */
export async function uploadQuizBatchToFirestore(
  userId: string,
  cards: TacticalQuizCard[]
): Promise<void> {
  const db = getActiveDb();
  if (!db || !userId || cards.length === 0) return;
  try {
    const nowIso = new Date().toISOString();
    const CHUNK = 400;
    for (let i = 0; i < cards.length; i += CHUNK) {
      const slice = cards.slice(i, i + CHUNK);
      const batch = writeBatch(db);
      for (const c of slice) {
        const stamped: TacticalQuizCard = {
          ...c,
          updatedAt: c.updatedAt || c.createdAt || nowIso,
        };
        batch.set(
          doc(db, 'users', userId, 'quizzes', toFirestoreDocId(c.id)),
          JSON.parse(JSON.stringify(stamped))
        );
      }
      await withTimeout(batch.commit(), 'batch.commit(quizzes)');
    }
  } catch (err) {
    console.warn('[FirestoreSync] Failed to batch upload quizzes:', err);
  }
}

/** Removes a quiz card from /users/{userId}/quizzes/{docId}. */
export async function deleteQuizCardFromFirestore(
  userId: string,
  cardId: string
): Promise<void> {
  const db = getActiveDb();
  if (!db || !userId) return;
  try {
    const ref = doc(db, 'users', userId, 'quizzes', toFirestoreDocId(cardId));
    await withTimeout(deleteDoc(ref), 'deleteDoc(quiz)');
    clearDeletedQuizId(cardId);
  } catch (err) {
    console.warn(`[FirestoreSync] Failed to delete quiz card ${cardId}:`, err);
  }
}

/**
 * Bidirectional tactical quiz pool sync (/users/{userId}/quizzes).
 * Flushes deletion tombstones first, then merges incrementally by updatedAt / createdAt.
 */
export async function syncQuizPoolWithCloud(
  userId: string,
  options?: CloudSyncOptions
): Promise<{ pulled: number; pushed: number }> {
  const db = getActiveDb();
  if (!db || !userId) return { pulled: 0, pushed: 0 };

  const pendingDeletes = loadDeletedQuizIds();
  if (pendingDeletes.length > 0) {
    await Promise.all(
      pendingDeletes.map((id) => deleteQuizCardFromFirestore(userId, id))
    );
  }
  const stillPendingDeletes = new Set(loadDeletedQuizIds());

  const syncStartedAtMs = Date.now();
  const cursor = options?.forceFull ? null : getCollectionCursor(userId, 'quizzes');
  const col = collection(db, 'users', userId, 'quizzes');
  const target = cursor
    ? query(col, where('updatedAt', '>', cursor.pullCursor))
    : col;
  const snapshot = await withTimeout(getDocs(target), 'getDocs(quizzes)');
  const cloudMap = new Map<string, TacticalQuizCard>();
  snapshot.forEach((d) => {
    const data = d.data() as TacticalQuizCard;
    if (
      data &&
      typeof data.id === 'string' &&
      data.id.length > 0 &&
      !stillPendingDeletes.has(data.id)
    ) {
      cloudMap.set(data.id, data);
    }
  });

  const merged = new Map<string, TacticalQuizCard>(
    loadQuizPool().map((c) => [c.id, c])
  );
  const toPush: TacticalQuizCard[] = [];
  let pulled = 0;

  const pushCursorMs = cursor ? isoTimeMs(cursor.pushCursor) : null;
  const nowIso = new Date(syncStartedAtMs).toISOString();

  cloudMap.forEach((cloudItem, id) => {
    const localItem = merged.get(id);
    if (!localItem || getQuizUpdatedMs(cloudItem) > getQuizUpdatedMs(localItem)) {
      merged.set(id, cloudItem);
      pulled++;
    }
  });

  merged.forEach((localItem, id) => {
    const cloudItem = cloudMap.get(id);
    if (
      shouldPushItemByCursor(
        cloudItem !== undefined,
        getQuizUpdatedMs(localItem),
        cloudItem ? getQuizUpdatedMs(cloudItem) : 0,
        pushCursorMs
      )
    ) {
      toPush.push(localItem);
    }
  });

  if (pulled > 0) {
    saveQuizPool(Array.from(merged.values()));
  }
  if (toPush.length > 0) {
    await uploadQuizBatchToFirestore(userId, toPush);
  }

  setCollectionCursor(userId, 'quizzes', {
    pullCursor: computePullCursor(syncStartedAtMs),
    pushCursor: nowIso,
    syncedAt: nowIso,
  });

  return { pulled, pushed: toPush.length };
}

/** Uploads a single free board diagram to /users/{userId}/diagrams/{docId}. */
export async function uploadFreeBoardDiagramToFirestore(
  userId: string,
  diagram: FreeBoardDiagram
): Promise<void> {
  const db = getActiveDb();
  if (!db || !userId) return;
  try {
    const ref = doc(db, 'users', userId, 'diagrams', toFirestoreDocId(diagram.id));
    const stamped: FreeBoardDiagram = {
      ...diagram,
      updatedAt: diagram.updatedAt || diagram.createdAt || new Date().toISOString(),
    };
    const sanitized = JSON.parse(JSON.stringify(stamped));
    await withTimeout(setDoc(ref, sanitized), 'setDoc(diagram)');
  } catch (err) {
    console.warn(`[FirestoreSync] Failed to upload diagram ${diagram.id}:`, err);
  }
}

/** Uploads multiple free board diagrams to /users/{userId}/diagrams in batches. */
export async function uploadFreeBoardDiagramBatchToFirestore(
  userId: string,
  diagrams: FreeBoardDiagram[]
): Promise<void> {
  const db = getActiveDb();
  if (!db || !userId || diagrams.length === 0) return;
  try {
    const nowIso = new Date().toISOString();
    const CHUNK = 400;
    for (let i = 0; i < diagrams.length; i += CHUNK) {
      const slice = diagrams.slice(i, i + CHUNK);
      const batch = writeBatch(db);
      for (const d of slice) {
        const stamped: FreeBoardDiagram = {
          ...d,
          updatedAt: d.updatedAt || d.createdAt || nowIso,
        };
        batch.set(
          doc(db, 'users', userId, 'diagrams', toFirestoreDocId(d.id)),
          JSON.parse(JSON.stringify(stamped))
        );
      }
      await withTimeout(batch.commit(), 'batch.commit(diagrams)');
    }
  } catch (err) {
    console.warn('[FirestoreSync] Failed to batch upload diagrams:', err);
  }
}

/** Removes a free board diagram from /users/{userId}/diagrams/{docId}. */
export async function deleteFreeBoardDiagramFromFirestore(
  userId: string,
  diagramId: string
): Promise<void> {
  const db = getActiveDb();
  if (!db || !userId) return;
  try {
    const ref = doc(db, 'users', userId, 'diagrams', toFirestoreDocId(diagramId));
    await withTimeout(deleteDoc(ref), 'deleteDoc(diagram)');
    clearDeletedDiagramId(diagramId);
  } catch (err) {
    console.warn(`[FirestoreSync] Failed to delete diagram ${diagramId}:`, err);
  }
}

/**
 * Bidirectional free board diagrams sync (/users/{userId}/diagrams).
 * Flushes deletion tombstones first, then merges incrementally by updatedAt / createdAt.
 */
export async function syncFreeBoardDiagramsWithCloud(
  userId: string,
  options?: CloudSyncOptions
): Promise<{ pulled: number; pushed: number }> {
  const db = getActiveDb();
  if (!db || !userId) return { pulled: 0, pushed: 0 };

  const pendingDeletes = loadDeletedDiagramIds();
  if (pendingDeletes.length > 0) {
    await Promise.all(
      pendingDeletes.map((id) => deleteFreeBoardDiagramFromFirestore(userId, id))
    );
  }
  const stillPendingDeletes = new Set(loadDeletedDiagramIds());

  const syncStartedAtMs = Date.now();
  const cursor = options?.forceFull ? null : getCollectionCursor(userId, 'diagrams');
  const col = collection(db, 'users', userId, 'diagrams');
  const target = cursor
    ? query(col, where('updatedAt', '>', cursor.pullCursor))
    : col;
  const snapshot = await withTimeout(getDocs(target), 'getDocs(diagrams)');
  const cloudMap = new Map<string, FreeBoardDiagram>();
  snapshot.forEach((d) => {
    const data = d.data() as FreeBoardDiagram;
    if (
      data &&
      typeof data.id === 'string' &&
      data.id.length > 0 &&
      !stillPendingDeletes.has(data.id)
    ) {
      cloudMap.set(data.id, data);
    }
  });

  const merged = new Map<string, FreeBoardDiagram>(
    loadFreeBoardDiagrams().map((d) => [d.id, d])
  );
  const toPush: FreeBoardDiagram[] = [];
  let pulled = 0;

  const pushCursorMs = cursor ? isoTimeMs(cursor.pushCursor) : null;
  const nowIso = new Date(syncStartedAtMs).toISOString();

  cloudMap.forEach((cloudItem, id) => {
    const localItem = merged.get(id);
    if (
      !localItem ||
      isoTimeMs(cloudItem.updatedAt || cloudItem.createdAt) >
        isoTimeMs(localItem.updatedAt || localItem.createdAt)
    ) {
      merged.set(id, cloudItem);
      pulled++;
    }
  });

  merged.forEach((localItem, id) => {
    const cloudItem = cloudMap.get(id);
    if (
      shouldPushItemByCursor(
        cloudItem !== undefined,
        isoTimeMs(localItem.updatedAt || localItem.createdAt),
        cloudItem ? isoTimeMs(cloudItem.updatedAt || cloudItem.createdAt) : 0,
        pushCursorMs
      )
    ) {
      toPush.push(localItem);
    }
  });

  if (pulled > 0) {
    saveFreeBoardDiagrams(Array.from(merged.values()));
  }
  if (toPush.length > 0) {
    await uploadFreeBoardDiagramBatchToFirestore(userId, toPush);
  }

  setCollectionCursor(userId, 'diagrams', {
    pullCursor: computePullCursor(syncStartedAtMs),
    pushCursor: nowIso,
    syncedAt: nowIso,
  });

  return { pulled, pushed: toPush.length };
}

/**
 * Ensures every record's sentePlayerId / gotePlayerId points to an existing profile.
 * Dangling references are re-resolved by player name. Returns number of repaired records.
 */
function reconcileGamePlayerRefs(): number {
  purgeGenericPlaceholderPlayers();
  const records = loadKifuRecords();
  const playerIds = new Set(loadPlayerProfiles().map((p) => p.id));
  let repaired = 0;
  for (const rec of records) {
    let sId = rec.sentePlayerId;
    let gId = rec.gotePlayerId;
    let changed = false;

    if (sId && !playerIds.has(sId)) {
      sId = undefined;
      changed = true;
    }
    if (gId && !playerIds.has(gId)) {
      gId = undefined;
      changed = true;
    }

    const skipResolution =
      rec.gameKind === 'other' ||
      rec.gameKind === 'joseki' ||
      rec.id.startsWith('tactic_');
    if (!skipResolution) {
      if (!sId && rec.senteName && !isGenericPlaceholderPlayerName(rec.senteName)) {
        const resolvedId = resolveOrRegisterPlayer(rec.senteName, 'pro').profile.id;
        if (resolvedId) {
          sId = resolvedId;
          playerIds.add(sId);
          changed = true;
        }
      }
      if (!gId && rec.goteName && !isGenericPlaceholderPlayerName(rec.goteName)) {
        const resolvedId = resolveOrRegisterPlayer(rec.goteName, 'pro').profile.id;
        if (resolvedId) {
          gId = resolvedId;
          playerIds.add(gId);
          changed = true;
        }
      }
    }

    if (changed) {
      saveKifuRecord({ ...rec, sentePlayerId: sId, gotePlayerId: gId });
      repaired++;
    }
  }
  return repaired;
}

export interface LastSyncInfo {
  syncedAt: string; // ISO 8601
  userId?: string;
  pulled: number;
  pushed: number;
  migrated: number;
}

const LAST_SYNC_STORAGE_KEY = 'joseki_tree_last_sync';

/** Returns the timestamp/result of the most recent cloud sync, or null. */
export function getLastSyncInfo(): LastSyncInfo | null {
  try {
    const raw = getSafeStorage().getItem(LAST_SYNC_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastSyncInfo>;
    if (typeof parsed.syncedAt !== 'string') return null;
    return {
      syncedAt: parsed.syncedAt,
      userId: typeof parsed.userId === 'string' ? parsed.userId : undefined,
      pulled: typeof parsed.pulled === 'number' ? parsed.pulled : 0,
      pushed: typeof parsed.pushed === 'number' ? parsed.pushed : 0,
      migrated: typeof parsed.migrated === 'number' ? parsed.migrated : 0,
    };
  } catch {
    return null;
  }
}

function recordSyncResult(
  userId: string,
  result: { pulled: number; pushed: number; migrated: number }
): void {
  const nowIso = new Date().toISOString();
  lastFullSyncByUser.set(userId, Date.now());
  try {
    const info: LastSyncInfo = { syncedAt: nowIso, userId, ...result };
    getSafeStorage().setItem(LAST_SYNC_STORAGE_KEY, JSON.stringify(info));
  } catch {
    // best-effort only
  }
}

function isWithinAutoFullSyncCooldown(userId: string): boolean {
  const now = Date.now();
  const memTs = lastFullSyncByUser.get(userId);
  if (memTs !== undefined && now - memTs < AUTO_FULL_SYNC_COOLDOWN_MS) {
    return true;
  }
  const last = getLastSyncInfo();
  if (last && (!last.userId || last.userId === userId)) {
    const persistedTs = Date.parse(last.syncedAt);
    if (!Number.isNaN(persistedTs) && now - persistedTs < AUTO_FULL_SYNC_COOLDOWN_MS) {
      return true;
    }
  }
  return false;
}

async function executeSyncKifuRecordsWithCloud(
  userId: string,
  options?: CloudSyncOptions
): Promise<{ pulled: number; pushed: number; migrated: number }> {
  const db = getActiveDb();
  if (!db || !userId) return { pulled: 0, pushed: 0, migrated: 0 };
  const subOptions: CloudSyncOptions | undefined = options?.forceFull
    ? { forceFull: true }
    : undefined;
  // Flush pending local deletion tombstones before pulling from Firestore
  const pendingDeletes = loadDeletedKifuIds();
  if (pendingDeletes.length > 0) {
    await Promise.all(
      pendingDeletes.map((id) => deleteKifuRecordFromFirestore(userId, id))
    );
  }
  // Players first so that game player references resolve on this device
  try {
    await syncPlayersWithCloud(userId, subOptions);
  } catch (err) {
    console.warn('[FirestoreSync] Player sync failed:', err);
  }
  // Sync tactics & study notes across devices (PC <-> Mobile)
  try {
    await syncTacticsWithCloud(userId, subOptions);
  } catch (err) {
    console.warn('[FirestoreSync] Tactics sync failed:', err);
  }
  // Sync tsumego problems and tactical quiz pool across devices
  try {
    await syncTsumegoWithCloud(userId, subOptions);
  } catch (err) {
    console.warn('[FirestoreSync] Tsumego sync failed:', err);
  }
  try {
    await syncQuizPoolWithCloud(userId, subOptions);
  } catch (err) {
    console.warn('[FirestoreSync] Quiz pool sync failed:', err);
  }
  try {
    await syncFreeBoardDiagramsWithCloud(userId, subOptions);
  } catch (err) {
    console.warn('[FirestoreSync] Free board diagrams sync failed:', err);
  }
  const pullResult = await pullCloudRecordsToLocal(userId, subOptions);
  // Repair game -> player references that point to missing profiles (match/create by name)
  const repaired = reconcileGamePlayerRefs();
  if (repaired > 0) {
    try {
      await syncPlayersWithCloud(userId);
    } catch (err) {
      console.warn('[FirestoreSync] Player re-sync failed:', err);
    }
  }
  const pushed = await syncLocalRecordsToCloud(userId, pullResult);
  const nowIso = new Date().toISOString();
  setCollectionCursor(userId, 'games', {
    pullCursor: computePullCursor(pullResult.syncStartedAtMs),
    pushCursor: new Date(pullResult.syncStartedAtMs).toISOString(),
    syncedAt: nowIso,
  });
  const result = { pulled: pullResult.pulled, pushed, migrated: pullResult.migrated };
  recordSyncResult(userId, result);
  return result;
}

/**
 * Performs bidirectional sync between local stores and Firestore.
 * Uses incremental updatedAt queries after initial full scan, reuses the games pull
 * snapshot for push reconciliation, and enforces cooldown/dedup in 'auto' mode.
 */
export async function syncKifuRecordsWithCloud(
  userId: string,
  options?: CloudSyncOptions
): Promise<{ pulled: number; pushed: number; migrated: number }> {
  const db = getActiveDb();
  if (!db || !userId) return { pulled: 0, pushed: 0, migrated: 0 };

  if (
    options?.mode === 'auto' &&
    !options.forceFull &&
    isWithinAutoFullSyncCooldown(userId)
  ) {
    return { pulled: 0, pushed: 0, migrated: 0 };
  }

  const existing = inFlightFullSync.get(userId);
  if (existing && !options?.forceFull) {
    return existing;
  }

  const task = executeSyncKifuRecordsWithCloud(userId, options).finally(() => {
    if (inFlightFullSync.get(userId) === task) {
      inFlightFullSync.delete(userId);
    }
  });
  inFlightFullSync.set(userId, task);
  return task;
}
