/**
 * Tsumego Storage Service.
 * Manages loading, saving, and querying tsumego problems from localStorage (with in-memory fallback for test runners).
 * Automatically seeds curated problems on first load.
 *
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import { TsumegoProblem, TsumegoAttemptResult } from '../types/tsumego';
import { scheduleAutoBackupToSyncDirectory } from './folderSyncBackup';
import { getSafeStorage } from './matchHistoryStorage';
import { hashTsumegoSfen } from './tsumegoImporter';
import { PRESET_TSUMEGO_SEEDS } from './tsumegoSeeds';

export const TSUMEGO_STORAGE_KEY = 'joseki_tree_tsumego_pool_v3';
export const TSUMEGO_ATTEMPTS_STORAGE_KEY = 'joseki_tree_tsumego_attempts';
export const DELETED_TSUMEGO_IDS_KEY = 'joseki_tree_deleted_tsumego_ids';
export const TSUMEGO_IMPORTED_HASHES_KEY = 'joseki_tree_tsumego_imported_hashes_v1';

export function loadDeletedTsumegoIds(): string[] {
  try {
    const raw = getSafeStorage().getItem(DELETED_TSUMEGO_IDS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string')
      : [];
  } catch {
    return [];
  }
}

export function markTsumegoDeleted(id: string): void {
  if (!id) return;
  try {
    const set = new Set(loadDeletedTsumegoIds());
    set.add(id);
    getSafeStorage().setItem(
      DELETED_TSUMEGO_IDS_KEY,
      JSON.stringify(Array.from(set))
    );
  } catch {
    // ignore storage errors
  }
}

export function clearDeletedTsumegoId(id: string): void {
  if (!id) return;
  try {
    const current = loadDeletedTsumegoIds();
    if (!current.includes(id)) return;
    getSafeStorage().setItem(
      DELETED_TSUMEGO_IDS_KEY,
      JSON.stringify(current.filter((x) => x !== id))
    );
  } catch {
    // ignore storage errors
  }
}

/**
 * Clears tsumego storage (primarily for test resets).
 */
export function clearTsumegoStorage(): void {
  const storage = getSafeStorage();
  storage.removeItem(TSUMEGO_STORAGE_KEY);
  storage.removeItem(TSUMEGO_ATTEMPTS_STORAGE_KEY);
  storage.removeItem(DELETED_TSUMEGO_IDS_KEY);
  storage.removeItem(TSUMEGO_IMPORTED_HASHES_KEY);
}

/**
 * Loads all tsumego problems from storage, seeding default problems if empty.
 */
export function loadTsumegoProblems(): TsumegoProblem[] {
  try {
    const storage = getSafeStorage();
    const raw = storage.getItem(TSUMEGO_STORAGE_KEY);
    if (!raw) {
      if (PRESET_TSUMEGO_SEEDS.length > 0) {
        saveTsumegoProblems(PRESET_TSUMEGO_SEEDS);
      }
      return [...PRESET_TSUMEGO_SEEDS];
    }
    const parsed = JSON.parse(raw) as TsumegoProblem[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [...PRESET_TSUMEGO_SEEDS];
    }
    const cleaned = parsed.filter(
      (p) => p.source !== 'preset' && !p.id.startsWith('seed-tsume-')
    );
    if (cleaned.length !== parsed.length) {
      saveTsumegoProblems(cleaned);
    }
    return cleaned;
  } catch (err) {
    console.warn('[TsumegoStorage] Failed loading tsumego problems:', err);
    return [...PRESET_TSUMEGO_SEEDS];
  }
}

/**
 * Saves full list of tsumego problems to storage.
 */
export function saveTsumegoProblems(problems: TsumegoProblem[]): void {
  scheduleAutoBackupToSyncDirectory();
  try {
    const storage = getSafeStorage();
    storage.setItem(TSUMEGO_STORAGE_KEY, JSON.stringify(problems));
  } catch (err) {
    console.warn('[TsumegoStorage] Failed saving tsumego problems:', err);
  }
}

/**
 * Adds or updates a single tsumego problem.
 */
export function saveTsumegoProblem(problem: TsumegoProblem): void {
  clearDeletedTsumegoId(problem.id);
  const nowIso = new Date().toISOString();
  const stamped: TsumegoProblem = {
    ...problem,
    updatedAt: nowIso,
  };
  const all = loadTsumegoProblems();
  const index = all.findIndex((p) => p.id === stamped.id);
  if (index >= 0) {
    all[index] = stamped;
  } else {
    all.push(stamped);
  }
  saveTsumegoProblems(all);
}

/**
 * Deletes a tsumego problem by ID and records a deletion tombstone for cloud sync.
 */
export function deleteTsumegoProblem(id: string): void {
  markTsumegoDeleted(id);
  const all = loadTsumegoProblems();
  const filtered = all.filter((p) => p.id !== id);
  saveTsumegoProblems(filtered);
}

/**
 * Loads all persisted tsumego solving attempts.
 */
export function loadAllTsumegoAttempts(): TsumegoAttemptResult[] {
  try {
    const raw = getSafeStorage().getItem(TSUMEGO_ATTEMPTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as TsumegoAttemptResult[]) : [];
  } catch {
    return [];
  }
}

/**
 * Overwrites persisted tsumego solving attempts (keeping at most 500 recent items).
 */
export function saveAllTsumegoAttempts(attempts: TsumegoAttemptResult[]): void {
  scheduleAutoBackupToSyncDirectory();
  try {
    const capped = attempts.length > 500 ? attempts.slice(attempts.length - 500) : attempts;
    getSafeStorage().setItem(TSUMEGO_ATTEMPTS_STORAGE_KEY, JSON.stringify(capped));
  } catch (err) {
    console.warn('[TsumegoStorage] Failed saving attempts:', err);
  }
}

/**
 * Records a user solving attempt.
 */
export function recordTsumegoAttempt(attempt: TsumegoAttemptResult): void {
  try {
    const list = loadAllTsumegoAttempts();
    list.push(attempt);
    saveAllTsumegoAttempts(list);

    // Update lastReviewedAt on the problem
    const problems = loadTsumegoProblems();
    const problem = problems.find((p) => p.id === attempt.problemId);
    if (problem) {
      problem.lastReviewedAt = attempt.timestamp;
      problem.updatedAt = new Date().toISOString();
      saveTsumegoProblems(problems);
    }
  } catch (err) {
    console.warn('[TsumegoStorage] Failed recording attempt:', err);
  }
}

/**
 * Gets attempt history for a specific problem.
 */
export function getTsumegoAttempts(problemId: string): TsumegoAttemptResult[] {
  return loadAllTsumegoAttempts().filter((a) => a.problemId === problemId);
}

/**
 * Loads hashes of previously imported SFEN tsumego puzzles to support unseen-only sampling.
 */
export function loadImportedTsumegoHashes(): string[] {
  try {
    const raw = getSafeStorage().getItem(TSUMEGO_IMPORTED_HASHES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((h): h is string => typeof h === 'string' && h.length > 0)
      : [];
  } catch {
    return [];
  }
}

/**
 * Saves deduplicated imported SFEN hashes and schedules auto-backup.
 */
export function saveImportedTsumegoHashes(hashes: string[]): void {
  const unique = Array.from(new Set(hashes.filter((h) => typeof h === 'string' && h.length > 0)));
  scheduleAutoBackupToSyncDirectory();
  try {
    getSafeStorage().setItem(TSUMEGO_IMPORTED_HASHES_KEY, JSON.stringify(unique));
  } catch (err) {
    console.warn('[TsumegoStorage] Failed saving imported hashes:', err);
  }
}

/**
 * Hashes and records SFEN strings as previously imported, returning the merged hash list.
 */
export function recordImportedTsumegoHashes(sfens: string[]): string[] {
  if (sfens.length === 0) return loadImportedTsumegoHashes();
  const next = new Set(loadImportedTsumegoHashes());
  for (const sfen of sfens) {
    if (sfen) {
      next.add(hashTsumegoSfen(sfen));
    }
  }
  const merged = Array.from(next);
  saveImportedTsumegoHashes(merged);
  return merged;
}
