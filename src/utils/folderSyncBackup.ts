/**
 * Folder Sync & Full App Backup Utility.
 * Supports:
 *  - Full app backup bundle (KifuRecords + TacticsNotes + AppSettings)
 *  - Timestamp-aware merge import (never overwrites newer local data)
 *  - Optional File System Access API directory handle persistence in IndexedDB
 *  - Optional auto-backup on exit and auto-sync on startup
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict without any (Rule 2).
 */

import { KifuRecord } from '../types/kifuRecord';
import { FreeBoardDiagram } from '../types/freeBoardDiagram';
import { TacticalQuizCard } from '../types/quiz';
import { TacticsNoteItem } from '../types/tacticsNote';
import { TsumegoAttemptResult, TsumegoProblem } from '../types/tsumego';
import {
  clearDeletedDiagramId,
  loadFreeBoardDiagrams,
  saveFreeBoardDiagrams,
} from './freeBoardDiagramStorage';
import { loadKifuRecords, saveKifuRecords } from './kifuRecordStorage';
import {
  clearDeletedQuizId,
  loadQuizPool,
  saveQuizPool,
} from './quizPoolStorage';
import { loadTacticsItems, saveTacticsItem } from './tacticsStorage';
import {
  clearDeletedTsumegoId,
  loadAllTsumegoAttempts,
  loadImportedTsumegoHashes,
  loadTsumegoProblems,
  saveAllTsumegoAttempts,
  saveImportedTsumegoHashes,
  saveTsumegoProblems,
} from './tsumegoStorage';
import { AppSettings, loadAppSettings, saveAppSettings } from './appSettingsStorage';
import { getSafeStorage } from './matchHistoryStorage';
import { idbGet, idbSet } from './idbKeyVal';

export const FOLDER_SYNC_OPTIONS_KEY = 'joseki_tree_folder_sync_options_v1';
export const FOLDER_SYNC_HANDLE_IDB_KEY = 'joseki_tree_sync_dir_handle';
export const BACKUP_FILENAME = 'joseki-tree-backup.json';

export interface FolderSyncOptions {
  autoBackupOnExit: boolean;
  autoSyncOnStartup: boolean;
  lastBackupAt?: string;
  lastSyncAt?: string;
}

export interface FullBackupBundle {
  version: 1;
  exportedAt: string;
  appName: 'joseki-tree';
  kifuRecords: KifuRecord[];
  tacticsItems: TacticsNoteItem[];
  tsumegoProblems?: TsumegoProblem[];
  tsumegoAttempts?: TsumegoAttemptResult[];
  tsumegoImportedHashes?: string[];
  freeBoardDiagrams?: FreeBoardDiagram[];
  quizCards?: TacticalQuizCard[];
  appSettings?: AppSettings;
}

export interface MergeBackupResult {
  addedKifu: number;
  updatedKifu: number;
  addedTactics: number;
  updatedTactics: number;
  addedTsumego: number;
  updatedTsumego: number;
  addedQuiz: number;
  updatedQuiz: number;
  addedDiagrams?: number;
  updatedDiagrams?: number;
}

interface DirectoryHandleWithPermission {
  name: string;
  getFileHandle: (
    name: string,
    options?: { create?: boolean }
  ) => Promise<{
    getFile: () => Promise<File>;
    createWritable: () => Promise<{
      write: (data: string) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
  queryPermission?: (desc: { mode: 'read' | 'readwrite' }) => Promise<string>;
  requestPermission?: (desc: { mode: 'read' | 'readwrite' }) => Promise<string>;
}

export function getFolderSyncOptions(): FolderSyncOptions {
  try {
    const raw = getSafeStorage().getItem(FOLDER_SYNC_OPTIONS_KEY);
    if (!raw) {
      return { autoBackupOnExit: false, autoSyncOnStartup: false };
    }
    const parsed = JSON.parse(raw) as Partial<FolderSyncOptions>;
    return {
      autoBackupOnExit: Boolean(parsed.autoBackupOnExit),
      autoSyncOnStartup: Boolean(parsed.autoSyncOnStartup),
      lastBackupAt: parsed.lastBackupAt,
      lastSyncAt: parsed.lastSyncAt,
    };
  } catch {
    return { autoBackupOnExit: false, autoSyncOnStartup: false };
  }
}

export function saveFolderSyncOptions(options: FolderSyncOptions): void {
  try {
    getSafeStorage().setItem(FOLDER_SYNC_OPTIONS_KEY, JSON.stringify(options));
  } catch {
    // ignore storage errors
  }
}

export function exportFullBackupBundle(): FullBackupBundle {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    appName: 'joseki-tree',
    kifuRecords: loadKifuRecords(),
    tacticsItems: loadTacticsItems(),
    tsumegoProblems: loadTsumegoProblems(),
    tsumegoAttempts: loadAllTsumegoAttempts(),
    tsumegoImportedHashes: loadImportedTsumegoHashes(),
    freeBoardDiagrams: loadFreeBoardDiagrams(),
    quizCards: loadQuizPool(),
    appSettings: loadAppSettings(),
  };
}

function getTsumegoTimestamp(p: TsumegoProblem): number {
  if (p.updatedAt) {
    const ms = Date.parse(p.updatedAt);
    if (!Number.isNaN(ms)) return ms;
  }
  return p.createdAt || 0;
}

function getQuizTimestamp(card: TacticalQuizCard): number {
  const iso = card.updatedAt || card.createdAt;
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
}

export function mergeFullBackupBundle(bundle: FullBackupBundle): MergeBackupResult {
  const result: MergeBackupResult = {
    addedKifu: 0,
    updatedKifu: 0,
    addedTactics: 0,
    updatedTactics: 0,
    addedTsumego: 0,
    updatedTsumego: 0,
    addedQuiz: 0,
    updatedQuiz: 0,
    addedDiagrams: 0,
    updatedDiagrams: 0,
  };

  // Merge KifuRecords by id & updatedAt
  if (Array.isArray(bundle.kifuRecords)) {
    const localRecords = loadKifuRecords();
    const localMap = new Map<string, KifuRecord>();
    for (const r of localRecords) {
      localMap.set(r.id, r);
    }
    let changed = false;
    for (const incoming of bundle.kifuRecords) {
      if (!incoming || !incoming.id) continue;
      const existing = localMap.get(incoming.id);
      if (!existing) {
        localMap.set(incoming.id, incoming);
        result.addedKifu += 1;
        changed = true;
      } else if ((incoming.updatedAt || '') > (existing.updatedAt || '')) {
        localMap.set(incoming.id, incoming);
        result.updatedKifu += 1;
        changed = true;
      }
    }
    if (changed) {
      saveKifuRecords(Array.from(localMap.values()));
    }
  }

  // Merge TacticsNoteItems by id & updatedAt
  if (Array.isArray(bundle.tacticsItems)) {
    const localTactics = loadTacticsItems();
    const localMap = new Map<string, TacticsNoteItem>();
    for (const t of localTactics) {
      localMap.set(t.id, t);
    }
    for (const incoming of bundle.tacticsItems) {
      if (!incoming || !incoming.id) continue;
      const existing = localMap.get(incoming.id);
      if (!existing) {
        saveTacticsItem(incoming);
        result.addedTactics += 1;
      } else if ((incoming.updatedAt || '') > (existing.updatedAt || '')) {
        saveTacticsItem(incoming);
        result.updatedTactics += 1;
      }
    }
  }

  // Merge TsumegoProblems by id & updatedAt/createdAt
  if (Array.isArray(bundle.tsumegoProblems)) {
    const localProblems = loadTsumegoProblems();
    const localMap = new Map<string, TsumegoProblem>();
    for (const p of localProblems) {
      localMap.set(p.id, p);
    }
    let changed = false;
    for (const incoming of bundle.tsumegoProblems) {
      if (!incoming || !incoming.id) continue;
      if (incoming.source === 'preset' || incoming.id.startsWith('seed-tsume-')) continue;
      clearDeletedTsumegoId(incoming.id);
      const existing = localMap.get(incoming.id);
      if (!existing) {
        localMap.set(incoming.id, incoming);
        result.addedTsumego += 1;
        changed = true;
      } else if (getTsumegoTimestamp(incoming) > getTsumegoTimestamp(existing)) {
        localMap.set(incoming.id, incoming);
        result.updatedTsumego += 1;
        changed = true;
      }
    }
    if (changed) {
      saveTsumegoProblems(Array.from(localMap.values()));
    }
  }

  // Merge TsumegoAttemptResults (union deduplicated by problemId + timestamp)
  if (Array.isArray(bundle.tsumegoAttempts) && bundle.tsumegoAttempts.length > 0) {
    const localAttempts = loadAllTsumegoAttempts();
    const seen = new Set(localAttempts.map((a) => `${a.problemId}:${a.timestamp}`));
    const mergedAttempts = [...localAttempts];
    let attemptsChanged = false;
    for (const incoming of bundle.tsumegoAttempts) {
      if (!incoming || typeof incoming.problemId !== 'string') continue;
      const key = `${incoming.problemId}:${incoming.timestamp}`;
      if (!seen.has(key)) {
        seen.add(key);
        mergedAttempts.push(incoming);
        attemptsChanged = true;
      }
    }
    if (attemptsChanged) {
      mergedAttempts.sort((a, b) => a.timestamp - b.timestamp);
      saveAllTsumegoAttempts(mergedAttempts);
    }
  }

  // Merge imported SFEN hash history (union)
  if (Array.isArray(bundle.tsumegoImportedHashes) && bundle.tsumegoImportedHashes.length > 0) {
    const localHashes = loadImportedTsumegoHashes();
    const mergedSet = new Set(localHashes);
    let hashesChanged = false;
    for (const h of bundle.tsumegoImportedHashes) {
      if (typeof h === 'string' && h.length > 0 && !mergedSet.has(h)) {
        mergedSet.add(h);
        hashesChanged = true;
      }
    }
    if (hashesChanged) {
      saveImportedTsumegoHashes(Array.from(mergedSet));
    }
  }

  // Merge TacticalQuizCards by id & updatedAt/createdAt
  if (Array.isArray(bundle.quizCards)) {
    const localCards = loadQuizPool();
    const localMap = new Map<string, TacticalQuizCard>();
    for (const c of localCards) {
      localMap.set(c.id, c);
    }
    let changed = false;
    for (const incoming of bundle.quizCards) {
      if (!incoming || !incoming.id) continue;
      clearDeletedQuizId(incoming.id);
      const existing = localMap.get(incoming.id);
      if (!existing) {
        localMap.set(incoming.id, incoming);
        result.addedQuiz += 1;
        changed = true;
      } else if (getQuizTimestamp(incoming) > getQuizTimestamp(existing)) {
        localMap.set(incoming.id, incoming);
        result.updatedQuiz += 1;
        changed = true;
      }
    }
    if (changed) {
      saveQuizPool(Array.from(localMap.values()));
    }
  }

  // Merge FreeBoardDiagrams by id & updatedAt
  if (Array.isArray(bundle.freeBoardDiagrams)) {
    const localDiagrams = loadFreeBoardDiagrams();
    const localMap = new Map<string, FreeBoardDiagram>();
    for (const d of localDiagrams) {
      localMap.set(d.id, d);
    }
    let changed = false;
    for (const incoming of bundle.freeBoardDiagrams) {
      if (!incoming || !incoming.id) continue;
      clearDeletedDiagramId(incoming.id);
      const existing = localMap.get(incoming.id);
      if (!existing) {
        localMap.set(incoming.id, incoming);
        result.addedDiagrams = (result.addedDiagrams ?? 0) + 1;
        changed = true;
      } else if ((incoming.updatedAt || '') > (existing.updatedAt || '')) {
        localMap.set(incoming.id, incoming);
        result.updatedDiagrams = (result.updatedDiagrams ?? 0) + 1;
        changed = true;
      }
    }
    if (changed) {
      saveFreeBoardDiagrams(Array.from(localMap.values()));
    }
  }

  if (bundle.appSettings) {
    const cur = loadAppSettings();
    saveAppSettings({ ...cur, ...bundle.appSettings });
  }

  return result;
}

export function isDirectoryPickerSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker ===
      'function'
  );
}

export async function pickSyncDirectory(): Promise<string | null> {
  if (!isDirectoryPickerSupported()) return null;
  const picker = (
    window as unknown as {
      showDirectoryPicker: (opts?: { mode?: 'readwrite' }) => Promise<DirectoryHandleWithPermission>;
    }
  ).showDirectoryPicker;
  const handle = await picker({ mode: 'readwrite' });
  await idbSet(FOLDER_SYNC_HANDLE_IDB_KEY, handle);
  return handle.name;
}

export async function getSavedSyncDirectoryName(): Promise<string | null> {
  try {
    const handle = await idbGet<DirectoryHandleWithPermission>(FOLDER_SYNC_HANDLE_IDB_KEY);
    return handle?.name ?? null;
  } catch {
    return null;
  }
}

export async function clearSyncDirectoryHandle(): Promise<void> {
  await idbSet(FOLDER_SYNC_HANDLE_IDB_KEY, null);
}

async function ensurePermission(
  handle: DirectoryHandleWithPermission,
  mode: 'read' | 'readwrite'
): Promise<boolean> {
  if (!handle.queryPermission || !handle.requestPermission) return true;
  const status = await handle.queryPermission({ mode });
  if (status === 'granted') return true;
  const req = await handle.requestPermission({ mode });
  return req === 'granted';
}

export async function writeBackupToSyncDirectory(): Promise<boolean> {
  const handle = await idbGet<DirectoryHandleWithPermission>(FOLDER_SYNC_HANDLE_IDB_KEY);
  if (!handle) return false;
  const ok = await ensurePermission(handle, 'readwrite');
  if (!ok) return false;

  const bundle = exportFullBackupBundle();
  const fileHandle = await handle.getFileHandle(BACKUP_FILENAME, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(bundle, null, 2));
  await writable.close();

  const opts = getFolderSyncOptions();
  saveFolderSyncOptions({ ...opts, lastBackupAt: bundle.exportedAt });
  return true;
}

export async function readBackupFromSyncDirectory(): Promise<MergeBackupResult | null> {
  const handle = await idbGet<DirectoryHandleWithPermission>(FOLDER_SYNC_HANDLE_IDB_KEY);
  if (!handle) return null;
  const ok = await ensurePermission(handle, 'read');
  if (!ok) return null;

  const fileHandle = await handle.getFileHandle(BACKUP_FILENAME, { create: false });
  const file = await fileHandle.getFile();
  const text = await file.text();
  const parsed = JSON.parse(text) as FullBackupBundle;
  if (!parsed || parsed.version !== 1 || parsed.appName !== 'joseki-tree') {
    return null;
  }
  const res = mergeFullBackupBundle(parsed);
  const opts = getFolderSyncOptions();
  saveFolderSyncOptions({ ...opts, lastSyncAt: new Date().toISOString() });
  return res;
}

let autoBackupTimer: number | null = null;

/**
 * Schedules a debounced (1s) backup to the sync directory if auto-backup is enabled.
 */
export function scheduleAutoBackupToSyncDirectory(): void {
  if (typeof window === 'undefined') return;
  if (!getFolderSyncOptions().autoBackupOnExit) return;
  if (autoBackupTimer !== null) {
    window.clearTimeout(autoBackupTimer);
  }
  autoBackupTimer = window.setTimeout(() => {
    autoBackupTimer = null;
    void writeBackupToSyncDirectory().catch(() => {});
  }, 1000);
}
