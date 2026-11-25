/**
 * Bulk operations for Unified Kifu Library (Issue #68, spec M4).
 * Performs single-pass writes via saveKifuRecords so tagIds/tags regeneration
 * and updatedAt stay consistent across 50+ records without UI lag.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import type { KifuRecord } from '../types/kifuRecord';
import { deleteCachedKifuPayload } from './kifuPayloadCache';
import {
  loadKifuRecords,
  markKifuRecordDeleted,
  purgeIdsFromLegacyStorages,
  saveKifuRecords,
} from './kifuRecordStorage';

function updateSelectedRecords(
  ids: string[],
  transform: (rec: KifuRecord, now: string) => KifuRecord | null
): number {
  if (ids.length === 0) return 0;
  const targetSet = new Set(ids);
  const now = new Date().toISOString();
  const records = loadKifuRecords();
  let changed = 0;

  const next = records.map((rec) => {
    if (!targetSet.has(rec.id)) return rec;
    const updated = transform(rec, now);
    if (!updated) return rec;
    changed++;
    return updated;
  });

  if (changed > 0) {
    saveKifuRecords(next);
  }
  return changed;
}

export function bulkAssignTag(ids: string[], tagId: string): number {
  if (!tagId) return 0;
  return updateSelectedRecords(ids, (rec, now) => {
    const current = rec.tagIds ?? [];
    if (current.includes(tagId)) return null;
    return {
      ...rec,
      tagIds: [...current, tagId],
      updatedAt: now,
    };
  });
}

export function bulkRemoveTag(ids: string[], tagId: string): number {
  if (!tagId) return 0;
  return updateSelectedRecords(ids, (rec, now) => {
    const current = rec.tagIds ?? [];
    if (!current.includes(tagId)) return null;
    return {
      ...rec,
      tagIds: current.filter((id) => id !== tagId),
      updatedAt: now,
    };
  });
}

export function bulkSetFavorite(ids: string[], favorite: boolean): number {
  return updateSelectedRecords(ids, (rec, now) => {
    if (Boolean(rec.favorite) === favorite) return null;
    return {
      ...rec,
      favorite,
      updatedAt: now,
    };
  });
}

export function bulkSetIncludedInTree(ids: string[], included: boolean): number {
  return updateSelectedRecords(ids, (rec, now) => {
    if (rec.isIncludedInTree === included) return null;
    return {
      ...rec,
      isIncludedInTree: included,
      updatedAt: now,
    };
  });
}

export function bulkDeleteRecords(ids: string[]): number {
  if (ids.length === 0) return 0;
  const targetSet = new Set(ids);
  const records = loadKifuRecords();
  const remaining = records.filter((rec) => !targetSet.has(rec.id));
  const deletedCount = records.length - remaining.length;
  if (deletedCount === 0) return 0;

  saveKifuRecords(remaining);
  purgeIdsFromLegacyStorages(targetSet);
  for (const id of targetSet) {
    markKifuRecordDeleted(id);
    void deleteCachedKifuPayload(id);
  }
  return deletedCount;
}

export function buildKifuBundleJson(records: KifuRecord[]): string {
  return JSON.stringify(
    {
      format: 'joseki-tree-kifu-bundle',
      version: 1,
      exportedAt: new Date().toISOString(),
      records,
    },
    null,
    2
  );
}
