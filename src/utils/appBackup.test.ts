import { beforeEach, describe, expect, it } from 'vitest';
import { getSafeStorage } from './matchHistoryStorage';
import {
  APP_SETTINGS_STORAGE_KEY,
  loadAppSettings,
  saveAppSettings,
} from './appSettingsStorage';
import { KIFU_RECORDS_STORAGE_KEY, loadKifuRecords } from './kifuRecordStorage';
import { KifuRecord } from '../types/kifuRecord';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  buildBackupJson,
  collectStorageUsage,
  parseBackupJson,
  resetAllAppData,
  restoreBackupData,
} from './appBackup';

import {
  TSUMEGO_ATTEMPTS_STORAGE_KEY,
  TSUMEGO_STORAGE_KEY,
} from './tsumegoStorage';

const ALL_TEST_KEYS = [
  APP_SETTINGS_STORAGE_KEY,
  KIFU_RECORDS_STORAGE_KEY,
  'joseki_tree_quiz_pool',
  TSUMEGO_STORAGE_KEY,
  TSUMEGO_ATTEMPTS_STORAGE_KEY,
  'joseki_tree_match_history',
  'joseki_tree_last_session',
  'joseki_tree_guest_mode',
  'joseki_tree_studio_saved_games',
  'joseki_tree_srs_cards_guest',
  'unrelated_key',
];

function makeRecord(id: string, contentHash: string): KifuRecord {
  return {
    id,
    title: `Game ${id}`,
    contentHash,
    source: 'studio',
    senteName: 'S',
    goteName: 'G',
    openingId: 'default',
    openingName: 'Default',
    totalPlies: 10,
    jkfJson: '{}',
    tags: [],
    isIncludedInTree: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('appBackup', () => {
  beforeEach(() => {
    const storage = getSafeStorage();
    for (const key of ALL_TEST_KEYS) storage.removeItem(key);
  });

  it('exports all joseki_tree_* keys except session/legacy keys', () => {
    getSafeStorage().setItem(APP_SETTINGS_STORAGE_KEY, '{"language":"en"}');
    getSafeStorage().setItem('joseki_tree_quiz_pool', '[]');
    getSafeStorage().setItem(TSUMEGO_STORAGE_KEY, '[{"id":"ts-1"}]');
    getSafeStorage().setItem(TSUMEGO_ATTEMPTS_STORAGE_KEY, '[{"problemId":"ts-1"}]');
    getSafeStorage().setItem('joseki_tree_last_session', '{"x":1}');
    getSafeStorage().setItem('joseki_tree_srs_cards_guest', '[]');

    const backup = parseBackupJson(buildBackupJson());
    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.version).toBe(BACKUP_VERSION);
    expect(backup.data[APP_SETTINGS_STORAGE_KEY]).toBe('{"language":"en"}');
    expect(backup.data['joseki_tree_quiz_pool']).toBe('[]');
    expect(backup.data[TSUMEGO_STORAGE_KEY]).toBe('[{"id":"ts-1"}]');
    expect(backup.data[TSUMEGO_ATTEMPTS_STORAGE_KEY]).toBe('[{"problemId":"ts-1"}]');
    expect(backup.data['joseki_tree_srs_cards_guest']).toBe('[]');
    // Excluded keys
    expect(backup.data['joseki_tree_last_session']).toBeUndefined();
    expect(backup.data['joseki_tree_guest_mode']).toBeUndefined();
    expect(backup.data['joseki_tree_studio_saved_games']).toBeUndefined();
  });

  it('round-trips a full restore on a clean profile', () => {
    saveAppSettings({
      language: 'en',
      defaultEngineId: 'tuyouraou11-mini',
      defaultAnalysisDepth: 16,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    getSafeStorage().setItem('joseki_tree_quiz_pool', '[{"id":"q1"}]');
    getSafeStorage().setItem(
      KIFU_RECORDS_STORAGE_KEY,
      JSON.stringify([makeRecord('r1', 'hash-a')])
    );

    const json = buildBackupJson();

    // Simulate a clean profile
    const storage = getSafeStorage();
    for (const key of ALL_TEST_KEYS) storage.removeItem(key);
    expect(loadKifuRecords()).toEqual([]);

    const backup = parseBackupJson(json);
    const result = restoreBackupData(backup.data);

    expect(result.restoredKeys).toContain(APP_SETTINGS_STORAGE_KEY);
    expect(result.restoredKeys).toContain('joseki_tree_quiz_pool');
    expect(result.addedKifuRecords).toBe(1);
    expect(loadAppSettings().language).toBe('en');
    expect(loadAppSettings().defaultEngineId).toBe('tuyouraou11-mini');
    expect(loadKifuRecords().map((r) => r.id)).toEqual(['r1']);
  });

  it('skips kifu records duplicated by id or contentHash', () => {
    getSafeStorage().setItem(
      KIFU_RECORDS_STORAGE_KEY,
      JSON.stringify([makeRecord('r1', 'hash-a'), makeRecord('r2', 'hash-b')])
    );

    // Backup contains: same id r1 (updated), same hash different id, and a new one
    const backupData = {
      [KIFU_RECORDS_STORAGE_KEY]: JSON.stringify([
        makeRecord('r1', 'hash-a'), // dup by id
        makeRecord('r3', 'hash-b'), // dup by contentHash
        makeRecord('r4', 'hash-c'), // genuinely new
      ]),
    };

    const result = restoreBackupData(backupData);
    expect(result.addedKifuRecords).toBe(1);
    expect(result.skippedKifuDuplicates).toBe(2);
    expect(loadKifuRecords().map((r) => r.id).sort()).toEqual(['r1', 'r2', 'r4']);
  });

  it('rejects invalid backup payloads', () => {
    expect(() => parseBackupJson('{"foo":1}')).toThrow();
    expect(() => parseBackupJson('not json')).toThrow();
    expect(() =>
      parseBackupJson(
        JSON.stringify({ format: BACKUP_FORMAT, version: 99, data: {} })
      )
    ).toThrow();
  });

  it('skips non-JSON values during restore', () => {
    const result = restoreBackupData({
      joseki_tree_quiz_pool: 'not-json{{{',
      joseki_tree_match_history: '[]',
    });
    expect(result.invalidEntries).toBe(1);
    expect(result.restoredKeys).toEqual(['joseki_tree_match_history']);
  });

  it('collects storage usage for all joseki_tree_* keys', () => {
    getSafeStorage().setItem('joseki_tree_quiz_pool', '[]');
    getSafeStorage().setItem(APP_SETTINGS_STORAGE_KEY, '{"language":"ja"}');
    getSafeStorage().setItem('unrelated_key', 'x');

    const usage = collectStorageUsage();
    const keys = usage.map((u) => u.key);
    expect(keys).toContain('joseki_tree_quiz_pool');
    expect(keys).toContain(APP_SETTINGS_STORAGE_KEY);
    expect(keys).not.toContain('unrelated_key');
    expect(usage.every((u) => u.bytes >= 0)).toBe(true);
    // Sorted by size descending
    for (let i = 1; i < usage.length; i++) {
      expect(usage[i - 1]!.bytes).toBeGreaterThanOrEqual(usage[i]!.bytes);
    }
  });

  it('resetAllAppData removes every joseki_tree_* key', () => {
    getSafeStorage().setItem('joseki_tree_quiz_pool', '[]');
    getSafeStorage().setItem(APP_SETTINGS_STORAGE_KEY, '{}');
    getSafeStorage().setItem('joseki_tree_srs_cards_guest', '[]');
    getSafeStorage().setItem('unrelated_key', 'keep');

    const removed = resetAllAppData();
    expect(removed).toBe(3);
    expect(getSafeStorage().getItem('joseki_tree_quiz_pool')).toBeNull();
    expect(getSafeStorage().getItem(APP_SETTINGS_STORAGE_KEY)).toBeNull();
    expect(getSafeStorage().getItem('joseki_tree_srs_cards_guest')).toBeNull();
    expect(getSafeStorage().getItem('unrelated_key')).toBe('keep');
  });
});
