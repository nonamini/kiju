/**
 * Storage persistence and merging utilities for tactical quiz cards.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import { TacticalQuizCard } from '../types/quiz';
import { scheduleAutoBackupToSyncDirectory } from './folderSyncBackup';
import { getSafeStorage } from './matchHistoryStorage';

export const QUIZ_POOL_STORAGE_KEY = 'joseki_tree_quiz_pool';
export const DELETED_QUIZ_IDS_KEY = 'joseki_tree_deleted_quiz_ids';

export function loadDeletedQuizIds(): string[] {
  try {
    const raw = getSafeStorage().getItem(DELETED_QUIZ_IDS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string')
      : [];
  } catch {
    return [];
  }
}

export function markQuizDeleted(id: string): void {
  if (!id) return;
  try {
    const set = new Set(loadDeletedQuizIds());
    set.add(id);
    getSafeStorage().setItem(DELETED_QUIZ_IDS_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // ignore storage errors
  }
}

export function clearDeletedQuizId(id: string): void {
  if (!id) return;
  try {
    const current = loadDeletedQuizIds();
    if (!current.includes(id)) return;
    getSafeStorage().setItem(
      DELETED_QUIZ_IDS_KEY,
      JSON.stringify(current.filter((x) => x !== id))
    );
  } catch {
    // ignore storage errors
  }
}

/**
 * Loads saved quiz cards from storage.
 * Returns empty array if data is missing, invalid, or corrupt JSON.
 */
export function loadQuizPool(): TacticalQuizCard[] {
  const storage = getSafeStorage();
  const raw = storage.getItem(QUIZ_POOL_STORAGE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed as TacticalQuizCard[];
  } catch {
    return [];
  }
}

/**
 * Persists quiz cards into storage and schedules folder auto-backup if enabled.
 */
export function saveQuizPool(cards: TacticalQuizCard[]): void {
  scheduleAutoBackupToSyncDirectory();
  const storage = getSafeStorage();
  storage.setItem(QUIZ_POOL_STORAGE_KEY, JSON.stringify(cards));
}

/**
 * Adds or updates a single quiz card and clears any deletion tombstone.
 */
export function saveQuizCard(card: TacticalQuizCard): TacticalQuizCard[] {
  clearDeletedQuizId(card.id);
  const stamped: TacticalQuizCard = {
    ...card,
    updatedAt: new Date().toISOString(),
  };
  const all = loadQuizPool();
  const index = all.findIndex((c) => c.id === stamped.id);
  const next =
    index >= 0
      ? all.map((c, i) => (i === index ? stamped : c))
      : [stamped, ...all];
  saveQuizPool(next);
  return next;
}

/**
 * Deletes a single quiz card by ID and records a deletion tombstone for cloud sync.
 */
export function deleteQuizCard(id: string): TacticalQuizCard[] {
  markQuizDeleted(id);
  const filtered = loadQuizPool().filter((c) => c.id !== id);
  saveQuizPool(filtered);
  return filtered;
}

/**
 * Completely clears all quiz cards from storage and records tombstones.
 */
export function clearQuizPool(): void {
  const current = loadQuizPool();
  for (const card of current) {
    markQuizDeleted(card.id);
  }
  const storage = getSafeStorage();
  storage.removeItem(QUIZ_POOL_STORAGE_KEY);
  scheduleAutoBackupToSyncDirectory();
}

/**
 * Merges fresh quiz cards into existing pool.
 * - If card ID already exists in existing, keep the existing card's `isEnabled` state,
 *   while taking updated metadata/position info from fresh.
 * - Cards in existing that are not present in fresh are preserved.
 * - Cards in fresh that are not present in existing are appended.
 */
export function mergeQuizCards(
  existing: TacticalQuizCard[],
  fresh: TacticalQuizCard[]
): TacticalQuizCard[] {
  const existingMap = new Map<string, TacticalQuizCard>();
  for (const card of existing) {
    existingMap.set(card.id, card);
  }

  const result: TacticalQuizCard[] = [];
  const processedFreshIds = new Set<string>();

  for (const freshCard of fresh) {
    processedFreshIds.add(freshCard.id);
    const prev = existingMap.get(freshCard.id);
    if (prev) {
      result.push({
        ...freshCard,
        isEnabled: prev.isEnabled,
      });
    } else {
      result.push(freshCard);
    }
  }

  // Preserve existing cards not in fresh
  for (const card of existing) {
    if (!processedFreshIds.has(card.id)) {
      result.push(card);
    }
  }

  return result;
}

/**
 * Updates isEnabled flag for specified card IDs immutably.
 */
export function setQuizEnabled(
  cards: TacticalQuizCard[],
  ids: string[],
  enabled: boolean
): TacticalQuizCard[] {
  const idSet = new Set(ids);
  const nowIso = new Date().toISOString();
  return cards.map((c) => {
    if (idSet.has(c.id)) {
      return { ...c, isEnabled: enabled, updatedAt: nowIso };
    }
    return c;
  });
}
