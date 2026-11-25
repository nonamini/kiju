import { beforeEach, describe, expect, it } from 'vitest';
import type { KifuRecord } from '../types/kifuRecord';
import { getSafeStorage } from './matchHistoryStorage';
import { loadKifuRecords, saveKifuRecords } from './kifuRecordStorage';
import {
  createTagDefinition,
  loadTagRegistry,
  saveTagRegistry,
} from './tagRegistryStorage';
import {
  buildTagDictionaryExportJson,
  changeTagGroupAndSync,
  countRecordsReferencingTag,
  deleteTagAndCleanupRecords,
  mergeTagIntoTarget,
  migrateLegacyCustomTagGroups,
  parseAndImportTagDictionaryJson,
  renameTagAndSyncRecords,
  TAG_DICTIONARY_FORMAT,
} from './tagDictionaryIo';

function makeRecord(id: string, tagIds: string[]): KifuRecord {
  const now = '2026-11-16T00:00:00.000Z';
  return {
    id,
    title: `Game ${id}`,
    contentHash: `hash-${id}`,
    source: 'import',
    senteName: '先手',
    goteName: '後手',
    openingId: 'kakugawari',
    openingName: '角換わり',
    totalPlies: 20,
    jkfJson: '{}',
    tagIds,
    tags: [],
    isIncludedInTree: false,
    createdAt: now,
    updatedAt: now,
  };
}

describe('tagDictionaryIo (Issue #69)', () => {
  beforeEach(() => {
    const s = getSafeStorage();
    s.clear();
  });

  it('renames a tag keeping its ID and updates referencing KifuRecords', () => {
    const tag = createTagDefinition('#新人王'.replace('#', ''), 'tournament');
    saveKifuRecords([makeRecord('g1', [tag.id]), makeRecord('g2', [])]);

    const renamed = renameTagAndSyncRecords(tag.id, '新人王戦');
    expect(renamed?.id).toBe(tag.id);
    expect(renamed?.name).toBe('新人王戦');

    const records = loadKifuRecords();
    const g1 = records.find((r) => r.id === 'g1');
    expect(g1?.tagIds).toEqual([tag.id]);
    expect(g1?.tags).toContain('新人王戦');
    expect(countRecordsReferencingTag(tag.id)).toBe(1);
  });

  it('deletes a tag and cleans up tagIds/tags from referencing records', () => {
    const tag = createTagDefinition('一時タグ', 'custom');
    saveKifuRecords([makeRecord('g1', [tag.id]), makeRecord('g2', [tag.id])]);

    expect(countRecordsReferencingTag(tag.id)).toBe(2);
    const res = deleteTagAndCleanupRecords(tag.id);
    expect(res.deleted).toBe(true);
    expect(res.affectedRecords).toBe(2);

    const records = loadKifuRecords();
    expect(records.every((r) => !r.tagIds?.includes(tag.id))).toBe(true);
    expect(loadTagRegistry().some((t) => t.id === tag.id)).toBe(false);
  });

  it('exports and imports JSON round-trip on clean profile, merging by id and name+groupId', () => {
    const customTag = createTagDefinition('独自戦法', 'custom');
    const json = buildTagDictionaryExportJson();
    const parsed = JSON.parse(json) as { format: string; tags: unknown[] };
    expect(parsed.format).toBe(TAG_DICTIONARY_FORMAT);
    expect(parsed.tags.length).toBeGreaterThan(0);

    // Clean profile import (builtin tags are auto-seeded and adopted; custom tag is added)
    getSafeStorage().clear();
    const cleanResult = parseAndImportTagDictionaryJson(json);
    expect(cleanResult.added).toBe(1);
    expect(cleanResult.adopted).toBe(parsed.tags.length - 1);
    expect(cleanResult.total).toBe(parsed.tags.length);
    const restored = loadTagRegistry();
    expect(restored.some((t) => t.id === customTag.id && t.name === '独自戦法')).toBe(true);

    // Re-import with same data -> adopted, no duplicates
    const secondResult = parseAndImportTagDictionaryJson(json);
    expect(secondResult.added).toBe(0);
    expect(secondResult.updated).toBe(0);
    expect(secondResult.adopted).toBe(parsed.tags.length);

    // Import with updated name for existing ID -> updates name
    const renamedExport = buildTagDictionaryExportJson(
      restored.map((t) => (t.id === customTag.id ? { ...t, name: '改名戦法' } : t))
    );
    const updateResult = parseAndImportTagDictionaryJson(renamedExport);
    expect(updateResult.updated).toBe(1);
    expect(loadTagRegistry().find((t) => t.id === customTag.id)?.name).toBe('改名戦法');
  });

  it('migrates legacy joseki_tree_custom_tag_groups entries into TagRegistry', () => {
    // Seed registry first without legacy key
    saveTagRegistry(loadTagRegistry());
    getSafeStorage().setItem(
      'joseki_tree_custom_tag_groups',
      JSON.stringify({
        custom: ['レガシータグA', 'レガシータグB'],
      })
    );

    const migrated = migrateLegacyCustomTagGroups();
    expect(migrated).toBe(2);
    const reg = loadTagRegistry();
    expect(reg.some((t) => t.name === 'レガシータグA' && t.groupId === 'custom')).toBe(true);
    expect(reg.some((t) => t.name === 'レガシータグB' && t.groupId === 'custom')).toBe(true);
  });

  it('rejects invalid format JSON on import', () => {
    expect(() =>
      parseAndImportTagDictionaryJson(JSON.stringify({ format: 'wrong', tags: [] }))
    ).toThrow();
  });

  it('changes a tag group and merges a source tag into a target tag cleanly', () => {
    const srcTag = createTagDefinition('プロ公式戦_旧', 'custom');
    const targetTag = createTagDefinition('プロ公式_新', 'source');
    saveKifuRecords([
      makeRecord('g1', [srcTag.id]),
      makeRecord('g2', [srcTag.id, targetTag.id]),
    ]);

    const moved = changeTagGroupAndSync(srcTag.id, 'source');
    expect(moved?.groupId).toBe('source');

    const mergeResult = mergeTagIntoTarget(srcTag.id, targetTag.id);
    expect(mergeResult.merged).toBe(true);
    expect(mergeResult.affectedRecords).toBe(2);

    const records = loadKifuRecords();
    const g1 = records.find((r) => r.id === 'g1');
    const g2 = records.find((r) => r.id === 'g2');
    expect(g1?.tagIds).toEqual([targetTag.id]);
    expect(g1?.tags).toEqual(['プロ公式_新']);
    expect(g2?.tagIds).toEqual([targetTag.id]);
    expect(loadTagRegistry().some((t) => t.id === srcTag.id)).toBe(false);
  });
});
