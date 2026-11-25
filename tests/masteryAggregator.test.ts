import { describe, it, expect } from 'vitest';
import { aggregateOpeningMastery } from '../src/utils/masteryAggregator';
import { SRSReviewCard } from '../src/types/srs';
import { MatchRecord } from '../src/types/match';

describe('aggregateOpeningMastery', () => {
  const createMockCard = (
    id: string,
    openingId: string,
    intervalDays: number,
    repetitionCount: number,
    totalAttempts: number,
    mistakes: number,
    dueDate: string = '2026-10-26'
  ): SRSReviewCard => ({
    id,
    userId: 'user1',
    openingId,
    sfen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
    correctMove: {
      ply: 1,
      color: 'b',
      from: { file: 7, rank: 7 },
      to: { file: 7, rank: 6 },
      piece: 'FU',
      promote: false,
      isDrop: false,
      kifString: '▲７六歩',
      sfenMove: '7g7f',
    },
    intervalDays,
    repetitionCount,
    easeFactor: 2.5,
    dueDate,
    totalAttempts,
    mistakes,
    hintsUsedCount: 0,
  });

  const createMockMatch = (
    id: string,
    openingId: string,
    result: MatchRecord['result']
  ): MatchRecord => ({
    id,
    userId: 'user1',
    openingId,
    startedAt: '2026-10-26T10:00:00Z',
    endedAt: '2026-10-26T10:20:00Z',
    userColor: 'b',
    startPly: 0,
    startSfen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
    moves: [],
    result,
    aiEngine: 'Fairy-Stockfish',
    aiDepth: 12,
    isMergedIntoTree: false,
  });

  it('handles empty inputs gracefully with zero values and no NaN', () => {
    const summary = aggregateOpeningMastery({
      srsCards: [],
      matchRecords: [],
    });

    expect(summary.totalCards).toBe(0);
    expect(summary.masteredCards).toBe(0);
    expect(summary.overallMasteryPct).toBe(0);
    expect(summary.totalMatches).toBe(0);
    expect(summary.overallWinRatePct).toBe(0);
    expect(summary.totalOpeningsPracticed).toBe(0);
    expect(summary.openings.length).toBeGreaterThan(0);
  });

  it('accurately computes SRS mastery stages and accuracy', () => {
    const cards: SRSReviewCard[] = [
      // Kakugawari: 1 mastered (interval >= 21), 1 review, 1 learning, 1 new
      createMockCard('c1', 'kakugawari', 25, 4, 10, 1), // mastered
      createMockCard('c2', 'kakugawari', 10, 2, 5, 1), // review
      createMockCard('c3', 'kakugawari', 2, 1, 3, 2), // learning
      createMockCard('c4', 'kakugawari', 1, 0, 0, 0), // new
    ];

    const summary = aggregateOpeningMastery({
      srsCards: cards,
      matchRecords: [],
      targetDate: new Date('2026-10-26'),
    });

    const kaku = summary.openings.find((o) => o.openingId === 'kakugawari');
    expect(kaku).toBeDefined();
    expect(kaku?.totalCards).toBe(4);
    expect(kaku?.masteredCards).toBe(1);
    expect(kaku?.reviewCards).toBe(1);
    expect(kaku?.learningCards).toBe(1);
    expect(kaku?.newCards).toBe(1);
    expect(kaku?.masteryPct).toBe(25); // 1 / 4 = 25%

    // Accuracy: attempts = 10+5+3 = 18, mistakes = 1+1+2 = 4 -> 14 / 18 = 78%
    expect(kaku?.accuracyPct).toBe(78);
  });

  it('accurately computes sparring match win rates', () => {
    const matches: MatchRecord[] = [
      createMockMatch('m1', 'yagura', 'win'),
      createMockMatch('m2', 'yagura', 'win'),
      createMockMatch('m3', 'yagura', 'loss'),
      createMockMatch('m4', 'yagura', 'draw'),
    ];

    const summary = aggregateOpeningMastery({
      srsCards: [],
      matchRecords: matches,
    });

    const yagura = summary.openings.find((o) => o.openingId === 'yagura');
    expect(yagura).toBeDefined();
    expect(yagura?.totalMatches).toBe(4);
    expect(yagura?.matchWins).toBe(2);
    expect(yagura?.matchLosses).toBe(1);
    expect(yagura?.matchDraws).toBe(1);
    // Win rate excludes draws: 2 / (2 + 1) = 67%
    expect(yagura?.winRatePct).toBe(67);
  });

  it('aggregates custom openings dynamically and sorts active openings first', () => {
    const cards: SRSReviewCard[] = [
      createMockCard('c1', 'custom_opening_x', 30, 5, 20, 0),
    ];
    const matches: MatchRecord[] = [
      createMockMatch('m1', 'custom_opening_x', 'win'),
    ];

    const summary = aggregateOpeningMastery({
      srsCards: cards,
      matchRecords: matches,
    });

    expect(summary.totalOpeningsPracticed).toBe(1);
    expect(summary.openings[0].openingId).toBe('custom_opening_x');
    expect(summary.openings[0].masteryPct).toBe(100);
    expect(summary.openings[0].winRatePct).toBe(100);
    expect(summary.openings[0].overallScore).toBe(100);
  });
});
