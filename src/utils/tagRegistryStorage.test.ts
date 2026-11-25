import { beforeEach, describe, expect, it } from 'vitest';
import { KifuRecord } from '../types/kifuRecord';
import {
  getKifuRecord,
  KIFU_RECORDS_STORAGE_KEY,
  saveKifuRecord,
  syncAllRecordTagsWithRegistry,
  updateKifuRecord,
} from './kifuRecordStorage';
import { getSafeStorage } from './matchHistoryStorage';
import {
  buildBuiltinTagId,
  createTagDefinition,
  deleteTagDefinition,
  findTagByName,
  getTagById,
  loadTagRegistry,
  renameTagDefinition,
  TAG_REGISTRY_STORAGE_KEY,
} from './tagRegistryStorage';

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
    totalPlies: 10,
    jkfJson: '{}',
    tags: [],
    isIncludedInTree: false,
    createdAt: '2026-11-15T00:00:00.000Z',
    updatedAt: '2026-11-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('tagRegistryStorage & KifuRecord.tagIds', () => {
  beforeEach(() => {
    const storage = getSafeStorage();
    storage.removeItem(TAG_REGISTRY_STORAGE_KEY);
    storage.removeItem(KIFU_RECORDS_STORAGE_KEY);
    storage.removeItem('joseki_tree_custom_tag_groups');
  });

  it('seeds built-in tags from STRUCTURED_TAG_GROUPS with deterministic IDs', () => {
    const defs = loadTagRegistry();
    expect(defs.length).toBeGreaterThan(20);

    const kakugawari = getTagById(buildBuiltinTagId('opening', '角換わり'));
    expect(kakugawari).not.toBeNull();
    expect(kakugawari?.name).toBe('角換わり');
    expect(kakugawari?.groupId).toBe('opening');
    expect(kakugawari?.isBuiltin).toBe(true);
  });

  it('migrates legacy record tags to tagIds and auto-registers unknown names into custom', () => {
    saveKifuRecord(
      makeRecord('r1', {
        tags: ['角換わり', 'オリジナル研究'],
      })
    );

    const stored = getKifuRecord('r1');
    expect(stored).not.toBeNull();
    expect(stored?.tags).toEqual(['角換わり', 'オリジナル研究']);
    expect(stored?.tagIds).toHaveLength(2);
    expect(stored?.tagIds?.[0]).toBe(buildBuiltinTagId('opening', '角換わり'));

    const customDef = findTagByName('オリジナル研究', 'custom');
    expect(customDef).not.toBeNull();
    expect(stored?.tagIds?.[1]).toBe(customDef?.id);
  });

  it('preserves record linkage and updates derived tags when renaming a TagDefinition', () => {
    const created = createTagDefinition('新人王', 'tournament');
    saveKifuRecord(
      makeRecord('r1', {
        tagIds: [created.id, buildBuiltinTagId('opening', '相掛かり')],
        tags: [],
      })
    );

    let stored = getKifuRecord('r1');
    expect(stored?.tags).toEqual(['新人王', '相掛かり']);

    const renamed = renameTagDefinition(created.id, '新人王戦');
    expect(renamed?.id).toBe(created.id);
    expect(renamed?.name).toBe('新人王戦');

    const updatedCount = syncAllRecordTagsWithRegistry();
    expect(updatedCount).toBe(1);

    stored = getKifuRecord('r1');
    expect(stored?.tagIds).toEqual([created.id, buildBuiltinTagId('opening', '相掛かり')]);
    expect(stored?.tags).toEqual(['新人王戦', '相掛かり']);
  });

  it('keeps tagIds and tags synchronized across updateKifuRecord and deleteTagDefinition', () => {
    const tagA = createTagDefinition('タグA', 'custom');
    const tagB = createTagDefinition('タグB', 'custom');
    saveKifuRecord(makeRecord('r1', { tags: ['タグA'] }));

    updateKifuRecord('r1', { tagIds: [tagA.id, tagB.id] });
    expect(getKifuRecord('r1')?.tags).toEqual(['タグA', 'タグB']);

    updateKifuRecord('r1', { tags: ['タグB'] });
    expect(getKifuRecord('r1')?.tagIds).toEqual([tagB.id]);

    expect(deleteTagDefinition(tagB.id)).toBe(true);
    syncAllRecordTagsWithRegistry();
    expect(getKifuRecord('r1')?.tags).toEqual([]);
  });

  it('reconciles legacy custom tags matching built-ins or aliases out of custom group', () => {
    const storage = getSafeStorage();
    const now = '2026-11-16T00:00:00.000Z';
    storage.setItem(
      TAG_REGISTRY_STORAGE_KEY,
      JSON.stringify([
        {
          id: 'tag-legacy-1',
          name: '女流清麗戦',
          groupId: 'custom',
          isBuiltin: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'tag-legacy-2',
          name: '達人戦',
          groupId: 'custom',
          isBuiltin: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'tag-legacy-3',
          name: '切れ負け',
          groupId: 'custom',
          isBuiltin: false,
          createdAt: now,
          updatedAt: now,
        },
      ])
    );

    const defs = loadTagRegistry();
    const seirei = defs.find((d) => d.id === 'tag-legacy-1');
    expect(seirei?.name).toBe('清麗戦');
    expect(seirei?.groupId).toBe('tournament');

    const tatsujin = defs.find((d) => d.id === 'tag-legacy-2');
    expect(tatsujin?.groupId).toBe('tournament');

    const kiremake = defs.find((d) => d.id === 'tag-legacy-3');
    expect(kiremake?.groupId).toBe('source');

    // Should not create duplicate built-in entries for promoted names
    expect(defs.filter((d) => d.name === '達人戦')).toHaveLength(1);
    expect(defs.filter((d) => d.name === '清麗戦')).toHaveLength(1);
  });
});
