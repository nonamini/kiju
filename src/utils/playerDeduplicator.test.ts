import { describe, it, expect, beforeEach } from 'vitest';
import { ShogiPlayerProfile } from '../types/player';
import { findDuplicatePlayerGroups, mergePlayerProfiles } from './playerDeduplicator';
import { savePlayerProfiles, loadPlayerProfiles, clearPlayerStorageForTest } from './playerStorage';
import { saveKifuRecords, loadKifuRecords, KIFU_RECORDS_STORAGE_KEY } from './kifuRecordStorage';
import { getSafeStorage } from './matchHistoryStorage';
import { KifuRecord } from '../types/kifuRecord';

describe('playerDeduplicator', () => {
  beforeEach(() => {
    clearPlayerStorageForTest();
    getSafeStorage().removeItem(KIFU_RECORDS_STORAGE_KEY);
  });

  it('detects duplicate player groups correctly', () => {
    const profiles: ShogiPlayerProfile[] = [
      {
        id: 'p1',
        name: '藤井聡太',
        category: 'pro',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'p2',
        name: '藤井 聡太',
        category: 'pro',
        createdAt: '2026-01-02T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
      },
      {
        id: 'p3',
        name: '羽生善治',
        category: 'pro',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];
    savePlayerProfiles(profiles);

    const duplicates = findDuplicatePlayerGroups(profiles);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]?.canonicalName).toBe('藤井聡太');
    expect(duplicates[0]?.candidates).toHaveLength(2);
  });

  it('merges player profiles and re-points KifuRecords correctly', () => {
    const profiles: ShogiPlayerProfile[] = [
      {
        id: 'p1',
        name: '藤井聡太',
        title: '竜王・名人',
        category: 'pro',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'p2',
        name: '藤井 聡太',
        category: 'pro',
        aliases: ['藤井竜王'],
        createdAt: '2026-01-02T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
      },
    ];
    savePlayerProfiles(profiles);

    const records: KifuRecord[] = [
      {
        id: 'rec-1',
        title: 'Game 1',
        source: 'import',
        sentePlayerId: 'p2',
        senteName: '藤井 聡太',
        gotePlayerId: 'other',
        goteName: '相手',
        openingId: 'kakugawari',
        openingName: '角換わり',
        jkfJson: '{}',
        isIncludedInTree: false,
        contentHash: 'hash-1',
        totalPlies: 100,
        tags: ['研究'],
        tagIds: ['study'],
        gameKind: 'pro',
        reviewStatus: 'unread',
        createdAt: '2026-01-02T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
      },
    ];
    saveKifuRecords(records);

    const result = mergePlayerProfiles('p1', ['p2']);
    expect(result.updatedRecordCount).toBe(1);

    const updatedProfiles = loadPlayerProfiles();
    expect(updatedProfiles).toHaveLength(1);
    expect(updatedProfiles[0]?.id).toBe('p1');
    expect(updatedProfiles[0]?.aliases).toContain('藤井 聡太');
    expect(updatedProfiles[0]?.aliases).toContain('藤井竜王');

    const updatedRecords = loadKifuRecords();
    expect(updatedRecords[0]?.sentePlayerId).toBe('p1');
    expect(updatedRecords[0]?.senteName).toBe('藤井聡太');
  });
});
