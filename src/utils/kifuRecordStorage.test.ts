import { beforeEach, describe, expect, it } from 'vitest';
import { KifuRecord } from '../types/kifuRecord';
import { getSafeStorage } from './matchHistoryStorage';
import {
  clearDeletedKifuId,
  DELETED_KIFU_IDS_KEY,
  deleteKifuRecord,
  getKifuRecord,
  KIFU_RECORDS_STORAGE_KEY,
  loadDeletedKifuIds,
  loadKifuRecords,
  markKifuRecordDeleted,
  saveKifuRecord,
  saveKifuRecords,
  updateKifuRecord,
} from './kifuRecordStorage';

function createDummyRecord(id: string, overrides: Partial<KifuRecord> = {}): KifuRecord {
  return {
    id,
    title: `Game ${id}`,
    contentHash: `hash-${id}`,
    source: 'import',
    senteName: '藤井聡太',
    goteName: '伊藤匠',
    openingId: 'aigakari',
    openingName: '相掛かり',
    totalPlies: 120,
    jkfJson: '{}',
    tags: [],
    isIncludedInTree: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('kifuRecordStorage', () => {
  beforeEach(() => {
    getSafeStorage().removeItem(KIFU_RECORDS_STORAGE_KEY);
  });

  it('loads empty array when storage is empty or JSON is corrupted', () => {
    expect(loadKifuRecords()).toEqual([]);

    getSafeStorage().setItem(KIFU_RECORDS_STORAGE_KEY, '{corrupted-json');
    expect(loadKifuRecords()).toEqual([]);

    getSafeStorage().setItem(KIFU_RECORDS_STORAGE_KEY, JSON.stringify({ notAnArray: true }));
    expect(loadKifuRecords()).toEqual([]);
  });

  it('persists and restores records via save/load round-trip', () => {
    const records = [createDummyRecord('r1'), createDummyRecord('r2', { favorite: true })];
    saveKifuRecords(records);

    const loaded = loadKifuRecords();
    expect(loaded).toHaveLength(2);
    expect(loaded[0]!.id).toBe('r1');
    expect(loaded[1]!.favorite).toBe(true);
  });

  it('saveKifuRecord appends new records and upserts existing ids', () => {
    saveKifuRecord(createDummyRecord('r1'));
    saveKifuRecord(createDummyRecord('r2'));
    expect(loadKifuRecords()).toHaveLength(2);

    saveKifuRecord(createDummyRecord('r1', { title: 'Renamed' }));
    const records = loadKifuRecords();
    expect(records).toHaveLength(2);
    expect(records.find((r) => r.id === 'r1')?.title).toBe('Renamed');
  });

  it('saveKifuRecord preserves createdAt and refreshes updatedAt on update', () => {
    const original = createDummyRecord('r1', {
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    });
    saveKifuRecord(original);

    saveKifuRecord({ ...original, title: 'Updated' });
    const stored = getKifuRecord('r1');
    expect(stored?.createdAt).toBe('2020-01-01T00:00:00.000Z');
    expect(stored?.updatedAt).not.toBe('2020-01-01T00:00:00.000Z');
  });

  it('getKifuRecord returns the record or null', () => {
    saveKifuRecord(createDummyRecord('r1'));
    expect(getKifuRecord('r1')?.title).toBe('Game r1');
    expect(getKifuRecord('missing')).toBeNull();
  });

  it('updateKifuRecord applies partial patches without touching id', () => {
    saveKifuRecord(createDummyRecord('r1', { notes: undefined }));

    const updated = updateKifuRecord('r1', { notes: 'memo', tags: ['研究'] });
    expect(updated?.notes).toBe('memo');
    expect(updated?.tags).toEqual(['研究']);
    expect(updated?.id).toBe('r1');

    expect(updateKifuRecord('missing', { notes: 'x' })).toBeNull();
  });

  it('updateKifuRecord cannot overwrite id via patch', () => {
    saveKifuRecord(createDummyRecord('r1'));
    saveKifuRecord(createDummyRecord('r2'));

    // Attempting to patch id should be ignored
    updateKifuRecord('r1', { id: 'r2' } as Partial<KifuRecord>);
    const r1 = getKifuRecord('r1');
    expect(r1).not.toBeNull();
    expect(r1?.id).toBe('r1');
    expect(getKifuRecord('r2')).not.toBeNull();
  });

  it('deleteKifuRecord removes only the targeted record', () => {
    saveKifuRecords([createDummyRecord('r1'), createDummyRecord('r2'), createDummyRecord('r3')]);
    deleteKifuRecord('r2');

    const remaining = loadKifuRecords();
    expect(remaining).toHaveLength(2);
    expect(remaining.map((r) => r.id).sort()).toEqual(['r1', 'r3']);

    // Deleting a non-existent id is a no-op
    deleteKifuRecord('nope');
    expect(loadKifuRecords()).toHaveLength(2);
  });

  it('tracks deletion tombstones and clears them on explicit clear or re-save', () => {
    getSafeStorage().removeItem(DELETED_KIFU_IDS_KEY);
    expect(loadDeletedKifuIds()).toEqual([]);

    markKifuRecordDeleted('r1');
    markKifuRecordDeleted('r1'); // deduplicated
    markKifuRecordDeleted('r2');
    expect(loadDeletedKifuIds()).toEqual(['r1', 'r2']);

    clearDeletedKifuId('r1');
    expect(loadDeletedKifuIds()).toEqual(['r2']);

    // deleteKifuRecord adds tombstone; saveKifuRecord clears it
    saveKifuRecord(createDummyRecord('r3'));
    deleteKifuRecord('r3');
    expect(loadDeletedKifuIds()).toEqual(['r2', 'r3']);

    saveKifuRecord(createDummyRecord('r3'));
    expect(loadDeletedKifuIds()).toEqual(['r2']);
  });

  it('purges deleted ids from legacy localStorage keys so deleted records never resurrect', () => {
    const storage = getSafeStorage();
    storage.setItem(
      'joseki_tree_studio_saved_games',
      JSON.stringify([{ id: 'legacy-1' }, { id: 'legacy-2' }])
    );
    storage.setItem(
      'joseki_tree_ingested_games',
      JSON.stringify([{ game: { id: 'ing-1' } }, { game: { id: 'ing-2' } }])
    );
    saveKifuRecords([createDummyRecord('legacy-1'), createDummyRecord('ing-1')]);

    deleteKifuRecord('legacy-1');
    deleteKifuRecord('ing-1');

    expect(
      JSON.parse(storage.getItem('joseki_tree_studio_saved_games') || '[]')
    ).toEqual([{ id: 'legacy-2' }]);
    expect(
      JSON.parse(storage.getItem('joseki_tree_ingested_games') || '[]')
    ).toEqual([{ game: { id: 'ing-2' } }]);
  });
});
