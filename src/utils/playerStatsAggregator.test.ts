import { describe, expect, it } from 'vitest';
import type { KifuRecord } from '../types/kifuRecord';
import type { ShogiPlayerProfile } from '../types/player';
import { aggregatePlayerStats } from './playerStatsAggregator';

function makeRecord(
  id: string,
  overrides: Partial<KifuRecord> = {}
): KifuRecord {
  const now = '2026-11-16T00:00:00.000Z';
  return {
    id,
    title: `Game ${id}`,
    contentHash: `hash-${id}`,
    source: 'studio',
    senteName: '藤井聡太',
    goteName: '伊藤匠',
    sentePlayerId: 'p-fujii',
    gotePlayerId: 'p-ito',
    openingId: 'kakugawari',
    openingName: '角換わり',
    winner: 'sente',
    totalPlies: 90,
    jkfJson: '{}',
    tags: [],
    isIncludedInTree: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('playerStatsAggregator (Issue #57)', () => {
  const profiles: ShogiPlayerProfile[] = [
    {
      id: 'p-fujii',
      name: '藤井聡太',
      category: 'pro',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'p-ito',
      name: '伊藤匠',
      category: 'pro',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  it('computes overall, sente/gote, yearly, opening, and opponent stats accurately', () => {
    const records: KifuRecord[] = [
      makeRecord('g1', { matchDate: '2025-06-01', winner: 'sente', openingId: 'kakugawari', openingName: '角換わり' }),
      makeRecord('g2', {
        matchDate: '2025-07-01',
        sentePlayerId: 'p-ito',
        senteName: '伊藤匠',
        gotePlayerId: 'p-fujii',
        goteName: '藤井聡太',
        winner: 'gote',
        openingId: 'aigakari',
        openingName: '相掛かり',
      }),
      makeRecord('g3', {
        matchDate: '2026-02-01',
        sentePlayerId: 'p-fujii',
        gotePlayerId: 'p-nagase',
        goteName: '永瀬拓矢',
        winner: 'gote',
        openingId: 'kakugawari',
        openingName: '角換わり',
      }),
      makeRecord('g4', {
        matchDate: '2026-03-01',
        sentePlayerId: 'p-fujii',
        gotePlayerId: 'p-ito',
        winner: 'draw',
      }),
      // Unrelated game should be ignored
      makeRecord('g5', {
        sentePlayerId: 'p-ito',
        gotePlayerId: 'p-nagase',
        winner: 'sente',
      }),
    ];

    const stats = aggregatePlayerStats('p-fujii', records, profiles);
    expect(stats.totalGames).toBe(4);
    expect(stats.wins).toBe(2);
    expect(stats.losses).toBe(1);
    expect(stats.draws).toBe(1);
    expect(stats.winRate).toBe(66.7);

    expect(stats.asSente).toEqual({
      games: 3,
      wins: 1,
      losses: 1,
      draws: 1,
      winRate: 50,
    });
    expect(stats.asGote).toEqual({
      games: 1,
      wins: 1,
      losses: 0,
      draws: 0,
      winRate: 100,
    });

    expect(stats.yearly.map((y) => y.year)).toEqual(['2025', '2026']);
    expect(stats.yearly[0]?.wins).toBe(2);
    expect(stats.topOpenings[0]?.openingId).toBe('kakugawari');
    expect(stats.topOpenings[0]?.games).toBe(3);
    expect(stats.topOpponents[0]?.opponentId).toBe('p-ito');
    expect(stats.topOpponents[0]?.games).toBe(3);
  });

  it('handles zero games gracefully', () => {
    const stats = aggregatePlayerStats('p-none', [], profiles);
    expect(stats.totalGames).toBe(0);
    expect(stats.winRate).toBe(0);
    expect(stats.yearly).toEqual([]);
    expect(stats.topOpenings).toEqual([]);
    expect(stats.topOpponents).toEqual([]);
  });
});
