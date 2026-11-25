/**
 * Saved search filter presets ("My Filter") storage utility (Issue #161).
 * Persists named filter presets separately scoped for Kifu Library (`kifu`)
 * and Players Directory (`players`) with localStorage + auto-backup hooks.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import type { PlayerCategory } from '../types/player';
import type { KifuLibraryFilterState } from './kifuLibraryFilter';
import type { PlayerSortDirection, PlayerSortField } from './playerListFilter';
import { scheduleAutoBackupToSyncDirectory } from './folderSyncBackup';
import { getSafeStorage } from './matchHistoryStorage';

export const MY_FILTERS_STORAGE_KEY = 'joseki_tree_my_filters_v1';

export type MyFilterScope = 'kifu' | 'players';

export type KifuMyFilterSortField =
  | 'updatedAt'
  | 'title'
  | 'matchDate'
  | 'totalPlies'
  | 'source';

export interface PlayerMyFilterState {
  category: 'all' | PlayerCategory;
  query: string;
  sortField: PlayerSortField;
  sortDirection: PlayerSortDirection;
}

export interface KifuMyFilterPreset {
  id: string;
  scope: 'kifu';
  name: string;
  filter: KifuLibraryFilterState;
  sortField?: KifuMyFilterSortField;
  sortDirection?: 'asc' | 'desc';
  createdAt: string;
  updatedAt: string;
}

export interface PlayerMyFilterPreset {
  id: string;
  scope: 'players';
  name: string;
  filter: PlayerMyFilterState;
  createdAt: string;
  updatedAt: string;
}

export type MyFilterPreset = KifuMyFilterPreset | PlayerMyFilterPreset;

function isValidPreset(raw: unknown): raw is MyFilterPreset {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const obj = raw as Record<string, unknown>;
  if (
    typeof obj.id !== 'string' ||
    !obj.id ||
    typeof obj.name !== 'string' ||
    !obj.name.trim()
  ) {
    return false;
  }
  if (obj.scope !== 'kifu' && obj.scope !== 'players') return false;
  if (!obj.filter || typeof obj.filter !== 'object' || Array.isArray(obj.filter)) {
    return false;
  }
  return true;
}

function persistMyFilters(presets: MyFilterPreset[]): void {
  try {
    getSafeStorage().setItem(MY_FILTERS_STORAGE_KEY, JSON.stringify(presets));
    scheduleAutoBackupToSyncDirectory();
  } catch (err) {
    console.warn('[MyFilterStorage] Failed saving presets:', err);
  }
}

export function loadMyFilters(): MyFilterPreset[] {
  try {
    const raw = getSafeStorage().getItem(MY_FILTERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidPreset);
  } catch {
    return [];
  }
}

export function loadKifuMyFilters(): KifuMyFilterPreset[] {
  return loadMyFilters().filter(
    (p): p is KifuMyFilterPreset => p.scope === 'kifu'
  );
}

export function loadPlayerMyFilters(): PlayerMyFilterPreset[] {
  return loadMyFilters().filter(
    (p): p is PlayerMyFilterPreset => p.scope === 'players'
  );
}

function generateMyFilterId(scope: MyFilterScope): string {
  return `myfilter_${scope}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function saveKifuMyFilter(params: {
  name: string;
  filter: KifuLibraryFilterState;
  sortField?: KifuMyFilterSortField;
  sortDirection?: 'asc' | 'desc';
  id?: string;
}): KifuMyFilterPreset {
  const trimmedName = params.name.trim();
  if (!trimmedName) {
    throw new Error('Filter name must not be empty');
  }
  const now = new Date().toISOString();
  const current = loadMyFilters();
  const existingIdx = params.id
    ? current.findIndex((p) => p.id === params.id && p.scope === 'kifu')
    : -1;
  const existing = existingIdx >= 0 ? (current[existingIdx] as KifuMyFilterPreset) : null;

  const nextPreset: KifuMyFilterPreset = {
    id: existing?.id ?? params.id ?? generateMyFilterId('kifu'),
    scope: 'kifu',
    name: trimmedName,
    filter: { ...params.filter },
    ...(params.sortField ? { sortField: params.sortField } : {}),
    ...(params.sortDirection ? { sortDirection: params.sortDirection } : {}),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const nextAll =
    existingIdx >= 0
      ? current.map((item, idx) => (idx === existingIdx ? nextPreset : item))
      : [...current, nextPreset];
  persistMyFilters(nextAll);
  return nextPreset;
}

export function savePlayerMyFilter(params: {
  name: string;
  filter: PlayerMyFilterState;
  id?: string;
}): PlayerMyFilterPreset {
  const trimmedName = params.name.trim();
  if (!trimmedName) {
    throw new Error('Filter name must not be empty');
  }
  const now = new Date().toISOString();
  const current = loadMyFilters();
  const existingIdx = params.id
    ? current.findIndex((p) => p.id === params.id && p.scope === 'players')
    : -1;
  const existing = existingIdx >= 0 ? (current[existingIdx] as PlayerMyFilterPreset) : null;

  const nextPreset: PlayerMyFilterPreset = {
    id: existing?.id ?? params.id ?? generateMyFilterId('players'),
    scope: 'players',
    name: trimmedName,
    filter: { ...params.filter },
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const nextAll =
    existingIdx >= 0
      ? current.map((item, idx) => (idx === existingIdx ? nextPreset : item))
      : [...current, nextPreset];
  persistMyFilters(nextAll);
  return nextPreset;
}

export function deleteMyFilter(id: string): void {
  if (!id) return;
  const current = loadMyFilters();
  const filtered = current.filter((p) => p.id !== id);
  if (filtered.length !== current.length) {
    persistMyFilters(filtered);
  }
}

export function clearMyFilters(): void {
  try {
    getSafeStorage().removeItem(MY_FILTERS_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}
