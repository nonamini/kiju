import { describe, expect, it, vi } from 'vitest';
import type { KifuRecord } from '../types/kifuRecord';
import type { TacticsNoteItem } from '../types/tacticsNote';

vi.mock('./kifuPayloadCache', () => ({
  getCachedKifuPayload: vi.fn(async () => null),
}));

import {
  extractTacticTargetSfen,
  findMatchingLibraryGamesForTactic,
  groupTacticsByHierarchy,
  inferTacticsHierarchyGroup,
} from './tacticsHierarchyAndLinks';

function makeTactic(overrides: Partial<TacticsNoteItem> & { id: string }): TacticsNoteItem {
  return {
    category: 'attacks',
    title: 'Sample Tactic',
    tag: '定跡',
    summary: '',
    ...overrides,
  };
}

function makeRecord(overrides: Partial<KifuRecord> & { id: string }): KifuRecord {
  return {
    title: overrides.id,
    contentHash: overrides.id,
    source: 'import',
    senteName: 'Sente',
    goteName: 'Gote',
    openingId: 'other',
    openingName: 'Other',
    totalPlies: 2,
    jkfJson: JSON.stringify({
      header: {},
      moves: [
        {},
        { move: { color: 0, from: { x: 2, y: 7 }, to: { x: 2, y: 6 }, piece: 'FU' } },
        { move: { color: 1, from: { x: 8, y: 3 }, to: { x: 8, y: 4 }, piece: 'FU' } },
        { move: { color: 0, from: { x: 2, y: 6 }, to: { x: 2, y: 5 }, piece: 'FU' } },
      ],
    }),
    tags: [],
    isIncludedInTree: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('tacticsHierarchyAndLinks (Issue #18)', () => {
  it('infers and orders hierarchy groups, respecting explicit hierarchyGroup overrides', () => {
    const t1 = makeTactic({ id: '1', title: '角換わり腰掛け銀', tag: '相掛かり・角換わり' });
    const t2 = makeTactic({ id: '2', title: 'ゴキゲン中飛車', tag: '振り飛車' });
    const t3 = makeTactic({ id: '3', title: '相振り三間飛車', tag: '相振り飛車' });
    const t4 = makeTactic({ id: '4', title: 'マイ研究', hierarchyGroup: '居飛車' });

    expect(inferTacticsHierarchyGroup(t1)).toBe('居飛車');
    expect(inferTacticsHierarchyGroup(t2)).toBe('振り飛車');
    expect(inferTacticsHierarchyGroup(t3)).toBe('相振り飛車');
    expect(inferTacticsHierarchyGroup(t4)).toBe('居飛車');

    const grouped = groupTacticsByHierarchy([t3, t2, t1, t4]);
    expect(grouped.map((g) => g.group)).toEqual(['居飛車', '振り飛車', '相振り飛車']);
    expect(grouped[0]?.items.map((i) => i.id)).toEqual(['1', '4']);
  });

  it('extracts target SFEN from moves and links matching library records', async () => {
    const blankNote = makeTactic({ id: 'blank', title: 'Empty Note' });
    expect(extractTacticTargetSfen(blankNote)).toBeNull();

    const kifuNote = makeTactic({
      id: 'kifu',
      title: '26f-84f',
      moves: ['2g2f', '8c8d'],
    });
    const targetSfen = extractTacticTargetSfen(kifuNote);
    expect(targetSfen).toBeTruthy();

    const matchRec = makeRecord({ id: 'match-1', title: '一致する対局' });
    const deletedRec = makeRecord({
      id: 'deleted-1',
      title: '削除済み',
      deletedAt: '2026-01-02T00:00:00Z',
    });

    const { matches } = await findMatchingLibraryGamesForTactic(kifuNote, [
      matchRec,
      deletedRec,
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.record.id).toBe('match-1');
    expect(matches[0]?.matchedPly).toBe(2);
  });
});
