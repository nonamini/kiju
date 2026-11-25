/**
 * Persistent storage for Shogi Trace training session results.
 * Follows Rule 1: strictly English code, comments, and identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import { getSafeStorage } from './matchHistoryStorage';

export const TRACE_HISTORY_STORAGE_KEY = 'joseki_tree_trace_sessions';

export interface TraceSessionStats {
  exact: number;
  near: number;
  aiBest: number;
  wrong: number;
  skipped: number;
}

export interface TraceSessionRecord {
  id: string;
  gameId: string | null;
  gameTitle: string;
  sideMode: 'both' | 'sente' | 'gote';
  startPly: number;
  endPly: number;
  stats: TraceSessionStats;
  playedAt: string; // ISO 8601
}

export function loadTraceHistory(): TraceSessionRecord[] {
  try {
    const raw = getSafeStorage().getItem(TRACE_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as TraceSessionRecord[];
  } catch {
    return [];
  }
}

export function saveTraceSession(record: TraceSessionRecord): void {
  try {
    const current = loadTraceHistory();
    const updated = [record, ...current].slice(0, 100);
    getSafeStorage().setItem(TRACE_HISTORY_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to save trace session history:', err);
  }
}
