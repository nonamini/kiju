/**
 * Tactics Note Storage utility.
 * Persists user customizations to localStorage while falling back to default starter templates.
 * Strictly English code, comments, identifiers (Rule 1).
 * Strictly TypeScript strict (Rule 2).
 */

import { TacticsNoteItem, TacticsShareBundle } from '../types/tacticsNote';
import { DEFAULT_TACTICS_ITEMS } from '../data/defaultTactics';
import { getSafeStorage } from './matchHistoryStorage';
import { scheduleAutoBackupToSyncDirectory } from './folderSyncBackup';

export const TACTICS_STORAGE_KEY = 'joseki_tree_custom_tactics';
export const DELETED_TACTICS_IDS_KEY = 'joseki_tree_deleted_tactic_ids';

export function loadDeletedTacticIds(): string[] {
  try {
    const raw = getSafeStorage().getItem(DELETED_TACTICS_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string')
      : [];
  } catch {
    return [];
  }
}

export function markTacticDeleted(id: string): void {
  if (!id) return;
  try {
    const set = new Set(loadDeletedTacticIds());
    set.add(id);
    getSafeStorage().setItem(
      DELETED_TACTICS_IDS_KEY,
      JSON.stringify(Array.from(set))
    );
  } catch {
    // ignore storage errors
  }
}

export function clearDeletedTacticId(id: string): void {
  if (!id) return;
  try {
    const current = loadDeletedTacticIds();
    if (!current.includes(id)) return;
    const filtered = current.filter((x) => x !== id);
    getSafeStorage().setItem(DELETED_TACTICS_IDS_KEY, JSON.stringify(filtered));
  } catch {
    // ignore storage errors
  }
}

/**
 * Loads a single tactics item by id.
 */
export function getTacticsItemById(id: string): TacticsNoteItem | undefined {
  const all = loadTacticsItems();
  return all.find((item) => item.id === id);
}

/**
 * Updates move comments for a specific tactic.
 */
export function updateTacticsMoveComment(
  id: string,
  ply: number,
  comment: string
): TacticsNoteItem | undefined {
  const current = loadTacticsItems();
  const target = current.find((item) => item.id === id);
  if (!target) return undefined;

  const existingComments = target.moveComments ? [...target.moveComments] : [];
  const commentIdx = existingComments.findIndex((c) => c.ply === ply);

  if (comment.trim() === '') {
    if (commentIdx >= 0) {
      existingComments.splice(commentIdx, 1);
    }
  } else {
    if (commentIdx >= 0) {
      existingComments[commentIdx] = { ply, comment: comment.trim() };
    } else {
      existingComments.push({ ply, comment: comment.trim() });
    }
  }

  let nextJkfJson = target.jkfJson;
  if (nextJkfJson) {
    try {
      const parsed = JSON.parse(nextJkfJson) as {
        moves?: Array<{ comments?: string[] }>;
      };
      if (parsed && Array.isArray(parsed.moves) && parsed.moves[ply]) {
        parsed.moves[ply] = {
          ...parsed.moves[ply],
          comments: comment.trim() ? [comment.trim()] : [],
        };
        nextJkfJson = JSON.stringify(parsed);
      }
    } catch {
      // Keep original jkfJson if malformed
    }
  }

  const updated: TacticsNoteItem = {
    ...target,
    jkfJson: nextJkfJson,
    moveComments: existingComments,
    isCustom: true,
    updatedAt: new Date().toISOString(),
  };

  saveTacticsItem(updated);
  return updated;
}

/**
 * Exports all tactics or a subset of tactics as a JSON share bundle string.
 */
export function exportTacticsAsJson(items?: TacticsNoteItem[]): string {
  const targetItems = items && items.length > 0 ? items : loadTacticsItems();
  const bundle: TacticsShareBundle = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    appName: 'joseki-tree',
    items: targetItems,
  };
  return JSON.stringify(bundle, null, 2);
}

/**
 * Imports tactics items from a JSON share bundle string or array.
 * Merges new items into the existing collection, updating existing items by ID.
 * Returns the count of successfully imported items.
 */
export function importTacticsFromJson(jsonStr: string): { success: boolean; count: number; error?: string } {
  try {
    const parsed = JSON.parse(jsonStr) as Partial<TacticsShareBundle> | TacticsNoteItem[];
    let incomingItems: TacticsNoteItem[] = [];

    if (Array.isArray(parsed)) {
      incomingItems = parsed as TacticsNoteItem[];
    } else if (parsed && Array.isArray(parsed.items)) {
      incomingItems = parsed.items;
    } else {
      return { success: false, count: 0, error: 'Invalid tactics bundle format' };
    }

    if (incomingItems.length === 0) {
      return { success: false, count: 0, error: 'No tactics items found in import' };
    }

    const current = loadTacticsItems();
    const currentMap = new Map<string, TacticsNoteItem>();
    for (const item of current) {
      currentMap.set(item.id, item);
    }

    let count = 0;
    for (const incoming of incomingItems) {
      if (!incoming.id || !incoming.title) continue;
      clearDeletedTacticId(incoming.id);
      currentMap.set(incoming.id, {
        ...incoming,
        isCustom: true,
        updatedAt: new Date().toISOString(),
      });
      count++;
    }

    const merged = Array.from(currentMap.values());
    saveAllTacticsItems(merged);
    return { success: true, count };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, count: 0, error: errorMsg };
  }
}

/**
 * Loads all tactics note items.
 * If user has saved custom items, returns them; otherwise returns default templates.
 */
export function loadTacticsItems(): TacticsNoteItem[] {
  try {
    const raw = getSafeStorage().getItem(TACTICS_STORAGE_KEY);
    if (!raw) return [...DEFAULT_TACTICS_ITEMS];
    const parsed = JSON.parse(raw) as TacticsNoteItem[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (err) {
    console.warn('[TacticsStorage] Failed to parse custom tactics from localStorage:', err);
  }
  return [...DEFAULT_TACTICS_ITEMS];
}

/**
 * Saves a tactics note item (creates new or updates existing).
 */
export function saveTacticsItem(item: TacticsNoteItem): TacticsNoteItem[] {
  scheduleAutoBackupToSyncDirectory();
  clearDeletedTacticId(item.id);
  const current = loadTacticsItems();
  const index = current.findIndex((it) => it.id === item.id);
  const now = new Date().toISOString();
  const updatedItem: TacticsNoteItem = {
    ...item,
    isCustom: true,
    updatedAt: now,
  };

  let nextList: TacticsNoteItem[];
  if (index >= 0) {
    nextList = [...current];
    nextList[index] = updatedItem;
  } else {
    nextList = [updatedItem, ...current];
  }

  saveAllTacticsItems(nextList);
  return nextList;
}

/**
 * Deletes a tactics note item by id.
 */
export function deleteTacticsItem(id: string): TacticsNoteItem[] {
  markTacticDeleted(id);
  const current = loadTacticsItems();
  const filtered = current.filter((it) => it.id !== id);
  saveAllTacticsItems(filtered);
  return filtered;
}

/**
 * Resets all tactics notes to default starter templates.
 */
export function resetTacticsToDefault(): TacticsNoteItem[] {
  getSafeStorage().removeItem(TACTICS_STORAGE_KEY);
  return [...DEFAULT_TACTICS_ITEMS];
}

/**
 * Directly overwrites all tactics items in storage.
 */
export function saveAllTacticsItems(items: TacticsNoteItem[]): void {
  try {
    getSafeStorage().setItem(TACTICS_STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    console.error('[TacticsStorage] Failed to save tactics to localStorage:', err);
  }
}
