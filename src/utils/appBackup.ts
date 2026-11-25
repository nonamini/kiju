/**
 * App-wide JSON backup / restore (Issue #48).
 * Exports every `joseki_tree_*` localStorage entry into a single versioned
 * JSON file and restores it with contentHash-aware duplicate handling for
 * kifu records. Session/ephemeral keys and legacy pre-KifuRecord keys are
 * excluded (canonical kifu data lives in joseki_tree_kifu_records).
 * Follows Rule 1: strictly English code, comments, identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import { getSafeStorage } from './matchHistoryStorage';
import {
  KIFU_RECORDS_STORAGE_KEY,
  loadKifuRecords,
  saveKifuRecords,
} from './kifuRecordStorage';
import { KifuRecord } from '../types/kifuRecord';

export const BACKUP_FORMAT = 'joseki-tree-backup';
export const BACKUP_VERSION = 1;
export const BACKUP_STORAGE_PREFIX = 'joseki_tree_';

/**
 * Keys intentionally excluded from backup:
 * - last_session / guest_mode: session & auth state, not portable data.
 * - studio_saved_games / studio_games / ingested_games: legacy keys left
 *   over from the pre-KifuRecord era; canonical data is in kifu_records.
 */
const EXCLUDED_KEYS = new Set([
  'joseki_tree_last_session',
  'joseki_tree_guest_mode',
  'joseki_tree_studio_saved_games',
  'joseki_tree_studio_games',
  'joseki_tree_ingested_games',
]);

export interface AppBackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  /** storageKey -> raw stored string (already JSON-encoded by the app) */
  data: Record<string, string>;
}

export interface RestoreResult {
  restoredKeys: string[];
  addedKifuRecords: number;
  skippedKifuDuplicates: number;
  invalidEntries: number;
}

/** Collects all backed-up storage entries (raw string values). */
export function collectBackupData(): Record<string, string> {
  const storage = getSafeStorage();
  const data: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || !key.startsWith(BACKUP_STORAGE_PREFIX) || EXCLUDED_KEYS.has(key)) {
      continue;
    }
    const value = storage.getItem(key);
    if (value !== null) {
      data[key] = value;
    }
  }
  if (!(KIFU_RECORDS_STORAGE_KEY in data)) {
    const records = loadKifuRecords();
    if (records.length > 0) {
      data[KIFU_RECORDS_STORAGE_KEY] = JSON.stringify(records);
    }
  }
  return data;
}

/** Serializes current app state into a backup JSON string. */
export function buildBackupJson(): string {
  const backup: AppBackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: collectBackupData(),
  };
  return JSON.stringify(backup, null, 2);
}

/**
 * Parses and validates a backup file payload.
 * Throws Error when the payload is not a supported backup.
 */
export function parseBackupJson(text: string): AppBackupFile {
  const parsed = JSON.parse(text) as Partial<AppBackupFile>;
  if (
    !parsed ||
    parsed.format !== BACKUP_FORMAT ||
    typeof parsed.data !== 'object' ||
    parsed.data === null
  ) {
    throw new Error('Not a valid joseki-tree backup file');
  }
  if (typeof parsed.version !== 'number' || parsed.version > BACKUP_VERSION) {
    throw new Error(`Unsupported backup version: ${String(parsed.version)}`);
  }
  return {
    format: BACKUP_FORMAT,
    version: parsed.version,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '',
    data: parsed.data as Record<string, string>,
  };
}

/**
 * Triggers a browser download of the current app state as JSON.
 * No-op outside the browser (tests call buildBackupJson directly).
 */
export function downloadBackupFile(): void {
  if (typeof document === 'undefined') return;
  const json = buildBackupJson();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  a.href = url;
  a.download = `joseki-tree-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface StorageUsageEntry {
  key: string;
  bytes: number;
}

/**
 * Lists every `joseki_tree_*` storage entry with its UTF-8 byte size.
 * Includes session keys (usage display is meant to be exhaustive).
 */
export function collectStorageUsage(): StorageUsageEntry[] {
  const storage = getSafeStorage();
  const entries: StorageUsageEntry[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || !key.startsWith(BACKUP_STORAGE_PREFIX)) continue;
    const value = storage.getItem(key);
    entries.push({
      key,
      bytes: value === null ? 0 : new Blob([value]).size,
    });
  }
  return entries.sort((a, b) => b.bytes - a.bytes);
}

/** Removes every `joseki_tree_*` storage entry. Returns removed key count. */
export function resetAllAppData(): number {
  const storage = getSafeStorage();
  const keysToRemove: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && key.startsWith(BACKUP_STORAGE_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    storage.removeItem(key);
  }
  return keysToRemove.length;
}

function isKifuRecordLike(value: unknown): value is KifuRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { id?: unknown }).id === 'string'
  );
}

/**
 * Restores backup entries into local storage.
 * - Kifu records are merged: a backup record is skipped when its id OR its
 *   contentHash already exists locally (same game, different metadata).
 * - All other keys are written verbatim (restore = snapshot semantics).
 */
export function restoreBackupData(data: Record<string, string>): RestoreResult {
  const result: RestoreResult = {
    restoredKeys: [],
    addedKifuRecords: 0,
    skippedKifuDuplicates: 0,
    invalidEntries: 0,
  };
  const storage = getSafeStorage();

  for (const [key, rawValue] of Object.entries(data)) {
    if (typeof rawValue !== 'string') {
      result.invalidEntries++;
      continue;
    }

    if (key === KIFU_RECORDS_STORAGE_KEY) {
      const merge = mergeKifuRecordsFromBackup(rawValue);
      result.addedKifuRecords += merge.added;
      result.skippedKifuDuplicates += merge.skipped;
      if (merge.touched) result.restoredKeys.push(key);
      continue;
    }

    // Light sanity check: backed-up values are JSON produced by the app.
    try {
      JSON.parse(rawValue);
    } catch {
      result.invalidEntries++;
      continue;
    }
    storage.setItem(key, rawValue);
    result.restoredKeys.push(key);
  }

  return result;
}

function mergeKifuRecordsFromBackup(rawValue: string): {
  added: number;
  skipped: number;
  touched: boolean;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    return { added: 0, skipped: 0, touched: false };
  }
  if (!Array.isArray(parsed)) {
    return { added: 0, skipped: 0, touched: false };
  }

  const backupRecords = parsed.filter(isKifuRecordLike);
  if (backupRecords.length === 0) {
    return { added: 0, skipped: 0, touched: false };
  }

  const existing = loadKifuRecords();
  const existingIds = new Set(existing.map((r) => r.id));
  const existingHashes = new Set(
    existing.map((r) => r.contentHash).filter((h): h is string => Boolean(h))
  );

  const additions: KifuRecord[] = [];
  let skipped = 0;
  for (const rec of backupRecords) {
    const isDuplicate =
      existingIds.has(rec.id) ||
      (typeof rec.contentHash === 'string' &&
        rec.contentHash.length > 0 &&
        existingHashes.has(rec.contentHash));
    if (isDuplicate) {
      skipped++;
    } else {
      additions.push(rec);
      existingIds.add(rec.id);
      if (rec.contentHash) existingHashes.add(rec.contentHash);
    }
  }

  if (additions.length > 0) {
    saveKifuRecords([...existing, ...additions]);
  }
  return { added: additions.length, skipped, touched: true };
}
