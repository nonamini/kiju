import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KifuRecord } from '../types/kifuRecord';

let mockStore: KifuRecord[] = [];

vi.mock('./kifuRecordStorage', () => ({
  loadKifuRecords: () => mockStore,
  saveKifuRecords: (next: KifuRecord[]) => {
    mockStore = next;
  },
  markKifuRecordDeleted: vi.fn(),
  purgeIdsFromLegacyStorages: vi.fn(),
}));

import {
  bulkMoveToFolder,
  bulkUnifyMetadataNames,
  normalizeShogiPlayerName,
  previewNameUnify,
} from './kifuLibraryBulkOps';

function makeRecord(overrides: Partial<KifuRecord> & { id: string }): KifuRecord {
  return {
    title: overrides.id,
    contentHash: overrides.id,
    source: 'import',
    senteName: '先手',
    goteName: '後手',
    openingId: 'other',
    openingName: 'Other',
    totalPlies: 50,
    jkfJson: '{}',
    tags: [],
    isIncludedInTree: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('kifuLibraryBulkOps (Issue #11)', () => {
  beforeEach(() => {
    mockStore = [];
  });

  it('normalizes Shogi player names by stripping trailing ranks and titles', () => {
    expect(normalizeShogiPlayerName('藤井聡太 竜王・名人')).toBe('藤井聡太');
    expect(normalizeShogiPlayerName('羽生善治　九段')).toBe('羽生善治');
    expect(normalizeShogiPlayerName('福間香奈 女流名人・女流王位')).toBe('福間香奈');
    expect(normalizeShogiPlayerName('里見香奈 女流五冠')).toBe('里見香奈');
    expect(normalizeShogiPlayerName('渡辺 明 名人')).toBe('渡辺 明');
    expect(normalizeShogiPlayerName('山田太郎（初段）')).toBe('山田太郎');
    expect(normalizeShogiPlayerName('藤井聡太竜王')).toBe('藤井聡太');
    expect(normalizeShogiPlayerName('木村一基')).toBe('木村一基');
  });

  it('moves selected records into a normalized folder path or uncategorized', () => {
    mockStore = [
      makeRecord({ id: '1', folderPath: '旧/パス' }),
      makeRecord({ id: '2', folderPath: '研究/角換わり' }),
      makeRecord({ id: '3' }),
    ];

    const moved = bulkMoveToFolder(['1', '2'], ' /研究//角換わり/ ');
    expect(moved).toBe(1);
    expect(mockStore.find((r) => r.id === '1')?.folderPath).toBe('研究/角換わり');
    expect(mockStore.find((r) => r.id === '2')?.folderPath).toBe('研究/角換わり');
    expect(mockStore.find((r) => r.id === '3')?.folderPath).toBeUndefined();

    const cleared = bulkMoveToFolder(['1', '3'], '');
    expect(cleared).toBe(1);
    expect(mockStore.find((r) => r.id === '1')?.folderPath).toBeUndefined();
  });

  it('previews and applies title stripping and string replacement across players and tournaments', () => {
    mockStore = [
      makeRecord({
        id: '1',
        senteName: '藤井聡太 竜王・名人',
        goteName: '永瀬拓矢 九段',
        tournament: '第9期叡王戦五番勝負',
      }),
      makeRecord({
        id: '2',
        senteName: '渡辺 明',
        goteName: '豊島将之 九段',
        tournament: '第9期叡王戦五番勝負',
      }),
    ];

    const previewStrip = previewNameUnify(mockStore, {
      field: 'players',
      mode: 'strip_titles',
    });
    expect(previewStrip.affectedCount).toBe(2);
    expect(previewStrip.samples).toEqual([
      { before: '藤井聡太 竜王・名人', after: '藤井聡太' },
      { before: '永瀬拓矢 九段', after: '永瀬拓矢' },
      { before: '豊島将之 九段', after: '豊島将之' },
    ]);

    const updatedPlayers = bulkUnifyMetadataNames(['1', '2'], {
      field: 'players',
      mode: 'strip_titles',
    });
    expect(updatedPlayers).toBe(2);
    expect(mockStore[0]?.senteName).toBe('藤井聡太');
    expect(mockStore[0]?.goteName).toBe('永瀬拓矢');
    expect(mockStore[1]?.senteName).toBe('渡辺 明');
    expect(mockStore[1]?.goteName).toBe('豊島将之');

    const updatedSpace = bulkUnifyMetadataNames(['2'], {
      field: 'players',
      mode: 'replace',
      find: '渡辺 明',
      replace: '渡辺明',
    });
    expect(updatedSpace).toBe(1);
    expect(mockStore[1]?.senteName).toBe('渡辺明');

    const updatedTournament = bulkUnifyMetadataNames(['1', '2'], {
      field: 'tournament',
      mode: 'replace',
      find: '五番勝負',
      replace: '',
    });
    expect(updatedTournament).toBe(2);
    expect(mockStore[0]?.tournament).toBe('第9期叡王戦');
    expect(mockStore[1]?.tournament).toBe('第9期叡王戦');
  });
});
