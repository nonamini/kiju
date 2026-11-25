import { beforeEach, describe, expect, it } from 'vitest';
import { KifuRecord } from '../types/kifuRecord';
import {
  buildKifuBundleJson,
  bulkAssignTag,
  bulkDeleteRecords,
  bulkRemoveTag,
  bulkSetFavorite,
  bulkSetIncludedInTree,
} from './kifuLibraryBulkOps';
import {
  DELETED_KIFU_IDS_KEY,
  KIFU_RECORDS_STORAGE_KEY,
  loadDeletedKifuIds,
  loadKifuRecords,
  saveKifuRecords,
} from './kifuRecordStorage';
import { getSafeStorage } from './matchHistoryStorage';
import { buildBuiltinTagId, TAG_REGISTRY_STORAGE_KEY } from './tagRegistryStorage';

function makeRecord(id: string, overrides: Partial<KifuRecord> = {}): KifuRecord {
  return {
    id,
    title: `Game ${id}`,
    contentHash: `hash-${id}`,
    source: 'studio',
    senteName: '先手',
    goteName: '後手',
    openingId: 'kakugawari',
    openingName: '角換わり',
    totalPlies: 60,
    jkfJson: '{}',
    tags: [],
    tagIds: [],
    isIncludedInTree: false,
    createdAt: '2026-11-15T00:00:00.000Z',
    updatedAt: '2026-11-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('kifuLibraryBulkOps', () => {
  beforeEach(() => {
    const storage = getSafeStorage();
    storage.removeItem(KIFU_RECORDS_STORAGE_KEY);
    storage.removeItem(TAG_REGISTRY_STORAGE_KEY);
    storage.removeItem(DELETED_KIFU_IDS_KEY);
  });

  it('assigns and removes tags across 50 records in a single batch', () => {
    const records = Array.from({ length: 50 }, (_, i) => makeRecord(`r-${i}`));
    saveKifuRecords(records);

    const tagId = buildBuiltinTagId('opening', '角換わり');
    const ids = records.map((r) => r.id);

    expect(bulkAssignTag(ids, tagId)).toBe(50);
    const afterAssign = loadKifuRecords();
    expect(afterAssign.every((r) => r.tagIds?.includes(tagId))).toBe(true);
    expect(afterAssign.every((r) => r.tags.includes('角換わり'))).toBe(true);

    expect(bulkRemoveTag(ids.slice(0, 20), tagId)).toBe(20);
    const afterRemove = loadKifuRecords();
    expect(afterRemove.filter((r) => r.tags.includes('角換わり'))).toHaveLength(30);
  });

  it('toggles favorite, isIncludedInTree, deletes with tombstones, and builds bundle JSON', () => {
    saveKifuRecords([makeRecord('a'), makeRecord('b'), makeRecord('c')]);

    expect(bulkSetFavorite(['a', 'b'], true)).toBe(2);
    expect(bulkSetIncludedInTree(['b', 'c'], true)).toBe(2);

    const bundle = JSON.parse(buildKifuBundleJson(loadKifuRecords())) as {
      format: string;
      records: KifuRecord[];
    };
    expect(bundle.format).toBe('joseki-tree-kifu-bundle');
    expect(bundle.records).toHaveLength(3);

    expect(bulkDeleteRecords(['a', 'c'])).toBe(2);
    expect(loadKifuRecords().map((r) => r.id)).toEqual(['b']);
    expect(loadDeletedKifuIds().sort()).toEqual(['a', 'c']);
  });
});
