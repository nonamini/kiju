import { beforeEach, describe, expect, it } from 'vitest';
import { mockTree } from '../src/mock/mockData';
import {
  calculateSrsSummary,
  clearAllSrsCards,
  extractSrsCardsFromTree,
  getDueCards,
  loadSrsCards,
  saveSrsCards,
} from '../src/utils/srsStorage';
import { SRSReviewCard } from '../src/types/srs';

describe('srsStorage (Card Extraction & Repository)', () => {
  beforeEach(() => {
    clearAllSrsCards('guest');
    clearAllSrsCards('user_test');
  });

  const baseDate = new Date(2026, 9, 19); // 2026-10-19

  it('extracts drill cards from MergedKifuTree for Sente player', () => {
    const cards = extractSrsCardsFromTree({
      tree: mockTree,
      targetSide: 'b',
      openingId: 'yagura',
      baseDate,
    });

    expect(cards.length).toBeGreaterThan(0);
    // Move 1 (7g7f) should be in the cards
    const move1Card = cards.find((c) => c.correctMove.sfenMove === '7g7f');
    expect(move1Card).toBeDefined();
    expect(move1Card?.correctMove.color).toBe('b');
    expect(move1Card?.intervalDays).toBe(1);
    expect(move1Card?.dueDate).toBe('2026-10-19');
  });

  it('preserves existing card progress when re-extracting from updated tree', () => {
    const initialCards = extractSrsCardsFromTree({
      tree: mockTree,
      targetSide: 'b',
      openingId: 'yagura',
      baseDate,
    });

    // Simulate user mastering card 1
    const card1 = initialCards[0];
    const learnedCard1: SRSReviewCard = {
      ...card1,
      repetitionCount: 3,
      intervalDays: 16,
      dueDate: '2026-11-04',
      totalAttempts: 5,
      mistakes: 1,
    };

    const reExtracted = extractSrsCardsFromTree({
      tree: mockTree,
      targetSide: 'b',
      openingId: 'yagura',
      existingCards: [learnedCard1],
      baseDate,
    });

    const matched = reExtracted.find((c) => c.id === card1.id);
    expect(matched).toBeDefined();
    expect(matched?.intervalDays).toBe(16);
    expect(matched?.repetitionCount).toBe(3);
    expect(matched?.totalAttempts).toBe(5);
  });

  it('saves and loads cards safely from LocalStorage', () => {
    const testCards: SRSReviewCard[] = [
      {
        id: 'c1',
        userId: 'u1',
        openingId: 'op1',
        sfen: 'sfen_test',
        correctMove: {
          ply: 1,
          color: 'b',
          from: { file: 7, rank: 7 },
          to: { file: 7, rank: 6 },
          piece: 'FU',
          isDrop: false,
          kifString: '▲７六歩(77)',
          sfenMove: '7g7f',
        },
        intervalDays: 6,
        repetitionCount: 2,
        easeFactor: 2.6,
        dueDate: '2026-10-25',
        totalAttempts: 2,
        mistakes: 0,
        hintsUsedCount: 0,
      },
    ];

    saveSrsCards(testCards, 'user_test');
    const loaded = loadSrsCards('user_test');

    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('c1');
    expect(loaded[0].intervalDays).toBe(6);
  });

  it('filters due cards and calculates statistical summary', () => {
    const cards: SRSReviewCard[] = [
      {
        id: 'due_today',
        userId: 'u1',
        openingId: 'op1',
        sfen: 'sfen1',
        correctMove: {
          ply: 1,
          color: 'b',
          to: { file: 7, rank: 6 },
          piece: 'FU',
          isDrop: false,
          kifString: '７六歩',
          sfenMove: '7g7f',
        },
        intervalDays: 1,
        repetitionCount: 0,
        easeFactor: 2.5,
        dueDate: '2026-10-19',
        totalAttempts: 0,
        mistakes: 0,
        hintsUsedCount: 0,
      },
      {
        id: 'overdue',
        userId: 'u1',
        openingId: 'op1',
        sfen: 'sfen2',
        correctMove: {
          ply: 3,
          color: 'b',
          to: { file: 2, rank: 6 },
          piece: 'FU',
          isDrop: false,
          kifString: '２六歩',
          sfenMove: '2g2f',
        },
        intervalDays: 1,
        repetitionCount: 1,
        easeFactor: 2.5,
        dueDate: '2026-10-15',
        totalAttempts: 3,
        mistakes: 1,
        hintsUsedCount: 1,
      },
      {
        id: 'future',
        userId: 'u1',
        openingId: 'op1',
        sfen: 'sfen3',
        correctMove: {
          ply: 5,
          color: 'b',
          to: { file: 4, rank: 8 },
          piece: 'GI',
          isDrop: false,
          kifString: '４八銀',
          sfenMove: '3i4h',
        },
        intervalDays: 25,
        repetitionCount: 4,
        easeFactor: 2.6,
        dueDate: '2026-11-10',
        totalAttempts: 4,
        mistakes: 0,
        hintsUsedCount: 0,
      },
    ];

    const dueList = getDueCards(cards, baseDate);
    expect(dueList).toHaveLength(2);
    // Overdue card appears first
    expect(dueList[0].id).toBe('overdue');
    expect(dueList[1].id).toBe('due_today');

    const summary = calculateSrsSummary(cards, baseDate);
    expect(summary.totalCount).toBe(3);
    expect(summary.dueCount).toBe(2);
    expect(summary.overdueCount).toBe(1);
    expect(summary.newCount).toBe(1);
    expect(summary.learningCount).toBe(1);
    expect(summary.masteredCount).toBe(1);
    expect(summary.totalAttempts).toBe(7);
    expect(summary.totalMistakes).toBe(1);
    // 6 correct out of 7 attempts = 86%
    expect(summary.accuracyRatePct).toBe(86);
  });
});
