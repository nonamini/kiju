import { describe, expect, it } from 'vitest';
import { KifuRecord } from '../types/kifuRecord';
import {
  countActiveFilters,
  DEFAULT_KIFU_LIBRARY_FILTER,
  filterKifuRecords,
  paginateKifuRecords,
} from './kifuLibraryFilter';

function makeRecord(id: string, overrides: Partial<KifuRecord> = {}): KifuRecord {
  return {
    id,
    title: `Game ${id}`,
    contentHash: `hash-${id}`,
    source: 'studio',
    senteName: '藤井聡太',
    goteName: '永瀬拓矢',
    gameKind: 'pro',
    openingId: 'kakugawari',
    openingName: '角換わり',
    winner: 'sente',
    matchDate: '2026-11-10',
    totalPlies: 100,
    jkfJson: '{}',
    tags: ['角換わり'],
    tagIds: ['builtin:opening:角換わり'],
    isIncludedInTree: false,
    createdAt: '2026-11-10T00:00:00.000Z',
    updatedAt: '2026-11-10T00:00:00.000Z',
    ...overrides,
  };
}

describe('kifuLibraryFilter', () => {
  it('filters by S1 text query across title, players, tournament, notes, and tags', () => {
    const records = [
      makeRecord('1', { title: '竜王戦第1局', tournament: '竜王戦', notes: '研究メモ' }),
      makeRecord('2', { title: '練習将棋', senteName: '羽生善治', tags: ['相掛かり'] }),
    ];

    expect(
      filterKifuRecords(records, { ...DEFAULT_KIFU_LIBRARY_FILTER, query: '研究メモ' }).map(
        (r) => r.id
      )
    ).toEqual(['1']);
    expect(
      filterKifuRecords(records, { ...DEFAULT_KIFU_LIBRARY_FILTER, query: '羽生' }).map(
        (r) => r.id
      )
    ).toEqual(['2']);
  });

  it('combines S2 structured filters (date range, winner, tag, analysis, favorite, source)', () => {
    const tagNames = new Map([['builtin:opening:角換わり', '角換わり']]);
    const records = [
      makeRecord('1', {
        matchDate: '2026-11-05',
        winner: 'sente',
        favorite: true,
        analysisStatus: 'completed',
        source: 'studio',
      }),
      makeRecord('2', {
        matchDate: '2026-11-12',
        winner: 'gote',
        favorite: true,
        analysisStatus: 'queued',
        source: 'import',
      }),
      makeRecord('3', {
        matchDate: '2026-11-14',
        winner: 'sente',
        favorite: false,
        analysisStatus: 'completed',
        source: 'tree',
      }),
    ];

    const filtered = filterKifuRecords(
      records,
      {
        ...DEFAULT_KIFU_LIBRARY_FILTER,
        dateFrom: '2026-11-01',
        dateTo: '2026-11-10',
        winner: 'sente',
        tagId: 'builtin:opening:角換わり',
        analysisStatus: 'analyzed',
        favoriteOnly: true,
        source: 'studio',
      },
      tagNames
    );
    expect(filtered.map((r) => r.id)).toEqual(['1']);
    expect(
      countActiveFilters({
        ...DEFAULT_KIFU_LIBRARY_FILTER,
        dateFrom: '2026-11-01',
        winner: 'sente',
        favoriteOnly: true,
      })
    ).toBe(3);
  });

  it('filters and paginates 500 records cleanly', () => {
    const records = Array.from({ length: 500 }, (_, i) =>
      makeRecord(`g-${i}`, {
        favorite: i % 5 === 0,
        matchDate: i % 2 === 0 ? '2026-11-10' : '2026-10-01',
      })
    );

    const start = performance.now();
    const filtered = filterKifuRecords(records, {
      ...DEFAULT_KIFU_LIBRARY_FILTER,
      favoriteOnly: true,
      dateFrom: '2026-11-01',
    });
    const elapsed = performance.now() - start;

    expect(filtered).toHaveLength(50);
    expect(elapsed).toBeLessThan(100);

    const page2 = paginateKifuRecords(filtered, 2, 20);
    expect(page2.totalPages).toBe(3);
    expect(page2.currentPage).toBe(2);
    expect(page2.items).toHaveLength(20);
  });

  it('excludes both joseki and study/other records from gameKind "all" and shows each under its own tab', () => {
    const records = [
      makeRecord('match-1', { gameKind: 'pro' }),
      makeRecord('tactic_game_hakoiri', {
        title: '箱入り娘',
        senteName: '先手',
        goteName: '後手',
        gameKind: 'joseki',
      }),
      makeRecord('custom_pos_1', {
        title: 'Study End',
        senteName: '先手',
        goteName: '後手',
        gameKind: 'other',
      }),
    ];

    expect(
      filterKifuRecords(records, { ...DEFAULT_KIFU_LIBRARY_FILTER, gameKind: 'all' }).map(
        (r) => r.id
      )
    ).toEqual(['match-1']);

    expect(
      filterKifuRecords(records, { ...DEFAULT_KIFU_LIBRARY_FILTER, gameKind: 'joseki' }).map(
        (r) => r.id
      )
    ).toEqual(['tactic_game_hakoiri']);

    expect(
      filterKifuRecords(records, { ...DEFAULT_KIFU_LIBRARY_FILTER, gameKind: 'other' }).map(
        (r) => r.id
      )
    ).toEqual(['custom_pos_1']);
  });

  it('supports multi-tag filtering with group_or_and, and, and or modes', () => {
    const tagNames = new Map<string, string>([
      ['t_ryuo', 'Ryuo'],
      ['t_meijin', 'Meijin'],
      ['t_kaku', 'Kakugawari'],
      ['t_aigakari', 'Aigakari'],
    ]);
    const tagGroups = new Map<string, string>([
      ['t_ryuo', 'tournament'],
      ['t_meijin', 'tournament'],
      ['t_kaku', 'opening'],
      ['t_aigakari', 'opening'],
    ]);

    const records = [
      makeRecord('g1', { tags: ['Ryuo', 'Kakugawari'], tagIds: ['t_ryuo', 't_kaku'] }),
      makeRecord('g2', { tags: ['Meijin', 'Kakugawari'], tagIds: ['t_meijin', 't_kaku'] }),
      makeRecord('g3', { tags: ['Meijin', 'Aigakari'], tagIds: ['t_meijin', 't_aigakari'] }),
      makeRecord('g4', {
        tags: ['Ryuo', 'Meijin', 'Kakugawari'],
        tagIds: ['t_ryuo', 't_meijin', 't_kaku'],
      }),
    ];

    // group_or_and: (Ryuo OR Meijin) AND (Kakugawari) -> g1, g2, g4
    expect(
      filterKifuRecords(
        records,
        {
          ...DEFAULT_KIFU_LIBRARY_FILTER,
          tagIds: ['t_ryuo', 't_meijin', 't_kaku'],
          tagMatchMode: 'group_or_and',
        },
        tagNames,
        tagGroups
      ).map((r) => r.id)
    ).toEqual(['g1', 'g2', 'g4']);

    // and: Ryuo AND Meijin AND Kakugawari -> g4 only
    expect(
      filterKifuRecords(
        records,
        {
          ...DEFAULT_KIFU_LIBRARY_FILTER,
          tagIds: ['t_ryuo', 't_meijin', 't_kaku'],
          tagMatchMode: 'and',
        },
        tagNames,
        tagGroups
      ).map((r) => r.id)
    ).toEqual(['g4']);

    // or: Ryuo OR Aigakari -> g1, g3, g4
    expect(
      filterKifuRecords(
        records,
        {
          ...DEFAULT_KIFU_LIBRARY_FILTER,
          tagIds: ['t_ryuo', 't_aigakari'],
          tagMatchMode: 'or',
        },
        tagNames,
        tagGroups
      ).map((r) => r.id)
    ).toEqual(['g1', 'g3', 'g4']);

    // Backwards compatibility with legacy single tagId
    expect(
      filterKifuRecords(
        records,
        {
          ...DEFAULT_KIFU_LIBRARY_FILTER,
          tagId: 't_ryuo',
          tagIds: [],
        },
        tagNames,
        tagGroups
      ).map((r) => r.id)
    ).toEqual(['g1', 'g4']);

    expect(
      countActiveFilters({
        ...DEFAULT_KIFU_LIBRARY_FILTER,
        tagIds: ['t_ryuo', 't_meijin'],
      })
    ).toBe(1);
  });

  it('evaluates Notion-style FilterRules with OR, AND, NOT, gameKind bypass, and dates', () => {
    const tagNames = new Map<string, string>([
      ['t_ryuo', 'Ryuo'],
      ['t_meijin', 'Meijin'],
      ['t_kaku', 'Kakugawari'],
      ['t_aigakari', 'Aigakari'],
    ]);

    const records = [
      makeRecord('g1', {
        gameKind: 'pro',
        analysisStatus: 'unanalyzed',
        matchDate: '2026-11-01',
        tags: ['Ryuo', 'Kakugawari'],
        tagIds: ['t_ryuo', 't_kaku'],
      }),
      makeRecord('g2', {
        gameKind: 'ladies',
        analysisStatus: 'failed',
        matchDate: '2026-11-05',
        tags: ['Meijin', 'Kakugawari'],
        tagIds: ['t_meijin', 't_kaku'],
      }),
      makeRecord('g3', {
        gameKind: 'pro',
        analysisStatus: 'completed',
        matchDate: '2026-11-10',
        tags: ['Meijin', 'Aigakari'],
        tagIds: ['t_meijin', 't_aigakari'],
      }),
      makeRecord('g4', {
        gameKind: 'joseki',
        analysisStatus: 'unanalyzed',
        matchDate: '2026-11-12',
        tags: ['Ryuo', 'Aigakari'],
        tagIds: ['t_ryuo', 't_aigakari'],
      }),
    ];

    // 1. analysisStatus OR rule: unanalyzed OR failed -> g1, g2 (excluding joseki under default gameKind='all')
    expect(
      filterKifuRecords(
        records,
        {
          ...DEFAULT_KIFU_LIBRARY_FILTER,
          rules: [
            {
              id: 'r1',
              field: 'analysisStatus',
              operator: 'in',
              values: ['unanalyzed', 'failed'],
            },
          ],
        },
        tagNames
      ).map((r) => r.id)
    ).toEqual(['g1', 'g2']);

    // 2. Multi-row tag: (Ryuo OR Meijin) AND (NOT Aigakari) -> g1, g2
    expect(
      filterKifuRecords(
        records,
        {
          ...DEFAULT_KIFU_LIBRARY_FILTER,
          ruleCombinator: 'and',
          rules: [
            { id: 'r1', field: 'tag', operator: 'in', values: ['t_ryuo', 't_meijin'] },
            { id: 'r2', field: 'tag', operator: 'not_in', values: ['t_aigakari'] },
          ],
        },
        tagNames
      ).map((r) => r.id)
    ).toEqual(['g1', 'g2']);

    // 3. ruleCombinator: 'or' across different fields -> analysisStatus=completed OR gameKind=ladies -> g2, g3
    expect(
      filterKifuRecords(
        records,
        {
          ...DEFAULT_KIFU_LIBRARY_FILTER,
          ruleCombinator: 'or',
          rules: [
            { id: 'r1', field: 'analysisStatus', operator: 'in', values: ['analyzed'] },
            { id: 'r2', field: 'gameKind', operator: 'in', values: ['ladies'] },
          ],
        },
        tagNames
      ).map((r) => r.id)
    ).toEqual(['g2', 'g3']);

    // 4. gameKind rule with joseki + pro bypasses default 'all' exclusion -> g1, g3, g4
    expect(
      filterKifuRecords(
        records,
        {
          ...DEFAULT_KIFU_LIBRARY_FILTER,
          rules: [
            { id: 'r1', field: 'gameKind', operator: 'in', values: ['pro', 'joseki'] },
          ],
        },
        tagNames
      ).map((r) => r.id)
    ).toEqual(['g1', 'g3', 'g4']);

    // 5. dateFrom & dateTo rules
    expect(
      filterKifuRecords(records, {
        ...DEFAULT_KIFU_LIBRARY_FILTER,
        rules: [
          { id: 'd1', field: 'dateFrom', operator: 'in', values: ['2026-11-02'] },
          { id: 'd2', field: 'dateTo', operator: 'in', values: ['2026-11-08'] },
        ],
      }).map((r) => r.id)
    ).toEqual(['g2']);

    expect(
      countActiveFilters({
        ...DEFAULT_KIFU_LIBRARY_FILTER,
        rules: [
          { id: 'r1', field: 'analysisStatus', operator: 'in', values: ['unanalyzed'] },
          { id: 'r2', field: 'tag', operator: 'in', values: [] }, // empty rule ignored
        ],
      })
    ).toBe(1);
  });
});
