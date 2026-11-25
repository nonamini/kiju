import { beforeEach, describe, expect, it } from 'vitest';
import { getSafeStorage } from './matchHistoryStorage';
import { KIFU_RECORDS_STORAGE_KEY, loadKifuRecords, saveKifuRecord } from './kifuRecordStorage';
import { computeKifuRecordContentHash } from './kifuContentHash';
import { rawKifToJkfJson } from './kifuRecordCodec';
import {
  findDuplicateKifuRecords,
  mergeTagsIntoExistingRecord,
} from './kifuDuplicateDetector';
import { KifuRecord } from '../types/kifuRecord';

const KIF_A = `手合割：平手
先手：テスト一
後手：テスト二
手数----指手---------消費時間--
1 ７六歩(77)
2 ３四歩(33)
3 ２六歩(27)
4 ８四歩(83)
`;

// Same moves, different header/comments -> same contentHash
const KIF_A_VARIANT = `#KIF version=2.0
棋戦：別の棋戦名
手合割：平手
先手：別の名前
後手：別の名前2
手数----指手---------消費時間--
   1 ７六歩(77)   ( 0:00/00:00:00)
   2 ３四歩(33)   ( 0:00/00:00:00)
   3 ２六歩(27)   ( 0:00/00:00:00)
   4 ８四歩(83)   ( 0:00/00:00:00)
`;

const KIF_B = `手合割：平手
先手：X
後手：Y
手数----指手---------消費時間--
1 ７六歩(77)
2 ３四歩(33)
3 ２五歩(26)
`;

function makeRecord(id: string, rawKif: string, overrides: Partial<KifuRecord> = {}): KifuRecord {
  return {
    id,
    title: `Rec ${id}`,
    contentHash: computeKifuRecordContentHash({ rawKif }),
    source: 'import',
    senteName: 'A',
    goteName: 'B',
    openingId: 'other',
    openingName: 'Other',
    totalPlies: 4,
    jkfJson: '{}',
    rawKif,
    tags: [],
    isIncludedInTree: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('kifuDuplicateDetector', () => {
  beforeEach(() => {
    getSafeStorage().removeItem(KIFU_RECORDS_STORAGE_KEY);
  });

  it('detects same moves across different KIF headers', () => {
    saveKifuRecord(makeRecord('r1', KIF_A));
    const dups = findDuplicateKifuRecords({ rawKif: KIF_A_VARIANT });
    expect(dups).toHaveLength(1);
    expect(dups[0]!.id).toBe('r1');
  });

  it('does not match different move sequences', () => {
    saveKifuRecord(makeRecord('r1', KIF_A));
    expect(findDuplicateKifuRecords({ rawKif: KIF_B })).toHaveLength(0);
  });

  it('respects excludeIds', () => {
    saveKifuRecord(makeRecord('r1', KIF_A));
    expect(findDuplicateKifuRecords({ rawKif: KIF_A, excludeIds: ['r1'] })).toHaveLength(0);
  });

  it('returns empty for unhashable input', () => {
    expect(findDuplicateKifuRecords({})).toHaveLength(0);
    expect(findDuplicateKifuRecords({ rawKif: 'garbage' })).toHaveLength(0);
  });

  it('matches via jkfJson when rawKif is absent', () => {
    saveKifuRecord(makeRecord('r1', KIF_A));
    // candidate provides only jkfJson generated from the same moves
    const jkf = rawKifToJkfJson(KIF_A_VARIANT);
    const dups = findDuplicateKifuRecords({ jkfJson: jkf });
    expect(dups.map((d) => d.id)).toContain('r1');
  });

  it('mergeTagsIntoExistingRecord unions tags and persists', () => {
    const rec = makeRecord('r1', KIF_A, { tags: ['研究'] });
    saveKifuRecord(rec);
    const merged = mergeTagsIntoExistingRecord(rec, ['詰み', '研究']);
    expect(merged).not.toBeNull();
    expect(merged!.tags).toEqual(['研究', '詰み']);
    expect(loadKifuRecords()[0]!.tags).toEqual(['研究', '詰み']);
    // no new tags -> no-op
    expect(mergeTagsIntoExistingRecord(merged!, ['研究'])).toBeNull();
    expect(mergeTagsIntoExistingRecord(rec, undefined)).toBeNull();
  });
});
