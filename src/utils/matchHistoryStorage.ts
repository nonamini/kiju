/**
 * Match History Storage and Repertoire Merging Helper.
 * Handles localStorage persistence of MatchRecord objects,
 * aggregate statistical metrics, and conversion into GameMergeInput for tree integration.
 * Strictly English code, comments, and variables (Rule 1).
 */

import { Color } from '../types/shogi';
import { MatchRecord } from '../types/match';
import { GameMergeInput } from './treeMerger';
import { IngestedGame } from '../types/tree';

export const MATCH_HISTORY_STORAGE_KEY = 'joseki_tree_match_history';

/**
 * Summary metrics of saved sparring match history.
 */
export interface MatchHistoryStats {
  totalMatches: number;
  wins: number;
  losses: number;
  draws: number;
  aborted: number;
  winRatePct: number;
}

// In-memory fallback for environments without window.localStorage (e.g., Node/Vitest)
const memoryStorage = new Map<string, string>();

export function getSafeStorage(): {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  readonly length: number;
  key: (index: number) => string | null;
} {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return {
    getItem: (key: string) => memoryStorage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memoryStorage.set(key, value);
    },
    removeItem: (key: string) => {
      memoryStorage.delete(key);
    },
    clear: () => {
      memoryStorage.clear();
    },
    get length() {
      return memoryStorage.size;
    },
    key: (index: number) => Array.from(memoryStorage.keys())[index] ?? null,
  };
}

/**
 * Loads all match records from browser localStorage or memory fallback.
 */
export function loadMatchRecords(): MatchRecord[] {
  try {
    const storage = getSafeStorage();
    const raw = storage.getItem(MATCH_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as MatchRecord[];
  } catch (error) {
    console.error('Failed to load match records from localStorage:', error);
    return [];
  }
}

/**
 * Saves a new match record into localStorage, prepending as most recent.
 */
export function saveMatchRecord(record: MatchRecord): MatchRecord[] {
  try {
    const storage = getSafeStorage();
    const records = loadMatchRecords();
    const updated = [record, ...records.filter((r) => r.id !== record.id)];
    storage.setItem(MATCH_HISTORY_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (error) {
    console.error('Failed to save match record to localStorage:', error);
    return [];
  }
}

/**
 * Updates an existing match record (e.g. marking isMergedIntoTree = true).
 */
export function updateMatchRecord(id: string, updates: Partial<MatchRecord>): MatchRecord[] {
  try {
    const storage = getSafeStorage();
    const records = loadMatchRecords();
    const updated = records.map((rec) => (rec.id === id ? { ...rec, ...updates } : rec));
    storage.setItem(MATCH_HISTORY_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (error) {
    console.error(`Failed to update match record ${id}:`, error);
    return [];
  }
}

/**
 * Deletes a single match record by ID.
 */
export function deleteMatchRecord(id: string): MatchRecord[] {
  try {
    const storage = getSafeStorage();
    const records = loadMatchRecords();
    const filtered = records.filter((rec) => rec.id !== id);
    storage.setItem(MATCH_HISTORY_STORAGE_KEY, JSON.stringify(filtered));
    return filtered;
  } catch (error) {
    console.error(`Failed to delete match record ${id}:`, error);
    return [];
  }
}

/**
 * Clears all match records from localStorage.
 */
export function clearAllMatchRecords(): void {
  try {
    const storage = getSafeStorage();
    storage.removeItem(MATCH_HISTORY_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear match records:', error);
  }
}

/**
 * Computes aggregate win/loss statistics from match records.
 */
export function calculateMatchHistoryStats(records: MatchRecord[]): MatchHistoryStats {
  const total = records.length;
  let wins = 0;
  let losses = 0;
  let draws = 0;
  let aborted = 0;

  for (const r of records) {
    if (r.result === 'win') wins++;
    else if (r.result === 'loss') losses++;
    else if (r.result === 'draw') draws++;
    else if (r.result === 'aborted') aborted++;
  }

  const completed = wins + losses;
  const winRatePct = completed > 0 ? (wins / completed) * 100 : 0;

  return {
    totalMatches: total,
    wins,
    losses,
    draws,
    aborted,
    winRatePct: Math.round(winRatePct * 10) / 10,
  };
}

/**
 * Converts a MatchRecord into a GameMergeInput ready to be ingested into MergedKifuTree.
 * Injects [Sparring] comments and reference metadata.
 */
export function convertMatchToGameMergeInput(
  record: MatchRecord,
  customTitle?: string
): GameMergeInput {
  const dateStr = record.endedAt ? record.endedAt.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const userSideStr = record.userColor === 'b' ? 'User (Sente)' : 'User (Gote)';
  const aiSideStr = `AI (${record.aiEngine})`;

  let winnerColor: Color | 'draw' | 'unknown' = 'unknown';
  if (record.result === 'win') {
    winnerColor = record.userColor;
  } else if (record.result === 'loss') {
    winnerColor = record.userColor === 'b' ? 'w' : 'b';
  } else if (record.result === 'draw') {
    winnerColor = 'draw';
  }

  const title = customTitle ?? `[Sparring] vs ${record.aiEngine} (${record.result.toUpperCase()})`;

  const game: IngestedGame = {
    id: `sparring_${record.id}`,
    userId: record.userId || 'local_user',
    openingId: record.openingId || 'sparring_repertoire',
    title,
    date: dateStr,
    senteName: record.userColor === 'b' ? userSideStr : aiSideStr,
    goteName: record.userColor === 'b' ? aiSideStr : userSideStr,
    tournament: `Sparring Session (${record.aiEngine})`,
    winner: winnerColor,
    plyCount: record.moves.length,
    rawKif: '',
    isIncluded: true,
    isAnalyzed: false,
    createdAt: record.startedAt,
    updatedAt: record.endedAt,
  };

  return {
    game,
    moves: [...record.moves],
  };
}
