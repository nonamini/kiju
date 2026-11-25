import { describe, expect, it } from 'vitest';
import type { KifuRecord } from '../types/kifuRecord';
import type { MatchRecord } from '../types/match';
import type { ShogiPlayerProfile } from '../types/player';
import type { SRSReviewCard } from '../types/srs';
import { aggregateMotivationActivity } from './activityAggregator';

const PROFILES: ShogiPlayerProfile[] = [
  {
    id: 'owner-1',
    name: 'MyUser',
    category: 'user',
    isOwner: true,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },
  {
    id: 'ai-piyo',
    name: 'PiyoShogi Lv10',
    category: 'ai',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },
];

function makeKifu(overrides: Partial<KifuRecord> = {}): KifuRecord {
  return {
    id: 'k1',
    title: 'Sample Kifu',
    contentHash: 'h1',
    source: 'import',
    senteName: 'Pro A',
    goteName: 'Pro B',
    openingId: 'kakugawari',
    openingName: '角換わり',
    winner: 'sente',
    gameKind: 'pro',
    totalPlies: 90,
    jkfJson: '{}',
    tags: [],
    isIncludedInTree: true,
    createdAt: '2026-11-16T08:00:00.000Z',
    updatedAt: '2026-11-16T08:00:00.000Z',
    ...overrides,
  };
}

function makeMatch(overrides: Partial<MatchRecord> = {}): MatchRecord {
  return {
    id: 'm1',
    userId: 'guest',
    openingId: 'shikenbisha',
    startedAt: '2026-11-15T10:00:00.000Z',
    endedAt: '2026-11-15T10:20:00.000Z',
    userColor: 'b',
    startPly: 0,
    startSfen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
    moves: [],
    result: 'win',
    aiEngine: 'Fairy-Stockfish',
    aiDepth: 10,
    isMergedIntoTree: false,
    ...overrides,
  };
}

function makeSrsCard(overrides: Partial<SRSReviewCard> = {}): SRSReviewCard {
  return {
    id: 'srs-1',
    userId: 'guest',
    openingId: 'yagura',
    sfen: 'startpos',
    correctMove: {
      ply: 1,
      color: 'b',
      from: { file: 7, rank: 7 },
      to: { file: 7, rank: 6 },
      piece: 'FU',
      isDrop: false,
      kifString: '▲７六歩',
      sfenMove: '7g7f',
    },
    intervalDays: 25,
    repetitionCount: 5,
    easeFactor: 2.5,
    dueDate: '2026-11-30',
    totalAttempts: 6,
    mistakes: 1,
    hintsUsedCount: 0,
    lastReviewedAt: '2026-11-14T12:00:00.000Z',
    ...overrides,
  };
}

describe('activityAggregator (Epic 13 Issue #53)', () => {
  const refDate = new Date('2026-11-16T15:00:00.000Z');

  it('produces identical results regardless of input array ordering', () => {
    const kifus = [
      makeKifu({ id: 'k1', openingId: 'kakugawari', createdAt: '2026-11-16T08:00:00.000Z' }),
      makeKifu({
        id: 'k2',
        gameKind: 'self',
        sentePlayerId: 'owner-1',
        gotePlayerId: 'ai-piyo',
        senteName: 'MyUser',
        goteName: 'PiyoShogi Lv10',
        openingId: 'yagura',
        openingName: '矢倉',
        winner: 'sente',
        matchDate: '2026-11-14',
        createdAt: '2026-11-14T10:00:00.000Z',
      }),
      makeKifu({
        id: 'k3',
        gameKind: 'self',
        sentePlayerId: 'ai-piyo',
        gotePlayerId: 'owner-1',
        senteName: 'PiyoShogi Lv10',
        goteName: 'MyUser',
        openingId: 'shikenbisha',
        openingName: '四間飛車',
        winner: 'sente',
        matchDate: '2026-11-15',
        createdAt: '2026-11-15T10:00:00.000Z',
      }),
    ];

    const matches = [
      makeMatch({ id: 'm1', result: 'win', endedAt: '2026-11-13T10:00:00.000Z' }),
      makeMatch({ id: 'm2', result: 'loss', endedAt: '2026-11-16T09:00:00.000Z' }),
    ];

    const cards = [
      makeSrsCard({ id: 'c1', lastReviewedAt: '2026-11-12T10:00:00.000Z' }),
      makeSrsCard({ id: 'c2', lastReviewedAt: '2026-11-15T11:00:00.000Z' }),
    ];

    const first = aggregateMotivationActivity({
      kifuRecords: kifus,
      matchRecords: matches,
      srsCards: cards,
      playerProfiles: PROFILES,
      referenceDate: refDate,
    });

    const reversed = aggregateMotivationActivity({
      kifuRecords: [...kifus].reverse(),
      matchRecords: [...matches].reverse(),
      srsCards: [...cards].reverse(),
      playerProfiles: [...PROFILES].reverse(),
      referenceDate: refDate,
    });

    expect(reversed).toEqual(first);
  });

  it('calculates currentStreakDays and longestStreakDays accurately across activity sources', () => {
    // Active days: 11-05, 11-06, 11-07, 11-08 (4 days longest), gap on 11-09..11-13, active 11-14, 11-15, 11-16 (3 days current)
    const kifus = [
      makeKifu({ id: 'k1', createdAt: '2026-11-05T10:00:00.000Z' }),
      makeKifu({ id: 'k2', createdAt: '2026-11-06T10:00:00.000Z' }),
      makeKifu({ id: 'k3', createdAt: '2026-11-16T08:00:00.000Z' }),
    ];
    const matches = [
      makeMatch({ id: 'm1', endedAt: '2026-11-07T10:00:00.000Z' }),
      makeMatch({ id: 'm2', endedAt: '2026-11-15T10:00:00.000Z' }),
    ];
    const cards = [
      makeSrsCard({ id: 'c1', lastReviewedAt: '2026-11-08T10:00:00.000Z' }),
      makeSrsCard({ id: 'c2', lastReviewedAt: '2026-11-14T10:00:00.000Z' }),
    ];

    const stats = aggregateMotivationActivity({
      kifuRecords: kifus,
      matchRecords: matches,
      srsCards: cards,
      referenceDate: refDate,
    });

    expect(stats.activeToday).toBe(true);
    expect(stats.currentStreakDays).toBe(3);
    expect(stats.longestStreakDays).toBe(4);
    expect(stats.weeklyTotalActions).toBe(3);
    expect(stats.weeklyKifuCount).toBe(1);
    expect(stats.weeklyMatchCount).toBe(1);
    expect(stats.weeklyReviewCount).toBe(1);
  });

  it('keeps yesterday streak alive when no activity recorded today yet', () => {
    const stats = aggregateMotivationActivity({
      kifuRecords: [
        makeKifu({ id: 'k1', createdAt: '2026-11-14T10:00:00.000Z' }),
        makeKifu({ id: 'k2', createdAt: '2026-11-15T10:00:00.000Z' }),
      ],
      referenceDate: refDate,
    });

    expect(stats.activeToday).toBe(false);
    expect(stats.currentStreakDays).toBe(2);
  });

  it('aggregates win-rate trend, recent form, opening & opponent breakdowns across MatchRecord and self KifuRecord', () => {
    const kifus = [
      makeKifu({
        id: 'self-win',
        gameKind: 'self',
        sentePlayerId: 'owner-1',
        gotePlayerId: 'ai-piyo',
        senteName: 'MyUser',
        goteName: 'PiyoShogi Lv10',
        openingId: 'kakugawari',
        openingName: '角換わり',
        winner: 'sente',
        matchDate: '2026-11-14',
        createdAt: '2026-11-14T09:00:00.000Z',
      }),
    ];
    const matches = [
      makeMatch({
        id: 'sparring-loss',
        openingId: 'shikenbisha',
        result: 'loss',
        aiEngine: 'Fairy-Stockfish',
        endedAt: '2026-11-15T12:00:00.000Z',
      }),
      makeMatch({
        id: 'sparring-win',
        openingId: 'shikenbisha',
        result: 'win',
        aiEngine: 'Fairy-Stockfish',
        endedAt: '2026-11-16T12:00:00.000Z',
      }),
      makeMatch({
        id: 'sparring-aborted',
        result: 'aborted',
        endedAt: '2026-11-16T13:00:00.000Z',
      }),
    ];

    const stats = aggregateMotivationActivity({
      kifuRecords: kifus,
      matchRecords: matches,
      playerProfiles: PROFILES,
      referenceDate: refDate,
    });

    expect(stats.totalMatches).toBe(3); // aborted excluded
    expect(stats.wins).toBe(2);
    expect(stats.losses).toBe(1);
    expect(stats.winRate).toBe(66.7);
    expect(stats.recentForm).toEqual(['win', 'loss', 'win']);
    expect(stats.winRateTrend.map((p) => p.cumulativeWinRate)).toEqual([100, 50, 66.7]);
    expect(stats.openingBreakdown.length).toBe(2);
    expect(stats.opponentBreakdown).toHaveLength(2);
  });

  it('computes opening coverage over the 9 major opening categories', () => {
    const kifus = [
      makeKifu({ id: 'k1', openingId: 'other', openingName: '角換わり腰掛け銀' }),
      makeKifu({ id: 'k2', openingId: 'nakabisha', openingName: '中飛車' }),
    ];
    const cards = [makeSrsCard({ id: 'c1', openingId: 'yagura' })];

    const stats = aggregateMotivationActivity({
      kifuRecords: kifus,
      srsCards: cards,
      referenceDate: refDate,
    });

    expect(stats.openingCoverage.totalCategories).toBe(9);
    expect(stats.openingCoverage.coveredCount).toBe(3);
    expect(stats.openingCoverage.coveragePct).toBe(33);
  });
});
