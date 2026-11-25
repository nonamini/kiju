import { describe, expect, it } from 'vitest';
import {
  addDays,
  applySm2Review,
  calculateReviewQuality,
  calculateSm2Update,
  DEFAULT_EASE_FACTOR,
  formatIsoDateOnly,
  getCardMaturity,
  isCardDue,
  MIN_EASE_FACTOR,
} from '../src/utils/sm2Scheduler';
import { SRSReviewCard } from '../src/types/srs';

describe('sm2Scheduler (SuperMemo-2 Algorithm)', () => {
  const baseCard: SRSReviewCard = {
    id: 'test_card_1',
    userId: 'user_1',
    openingId: 'yagura',
    sfen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
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
    intervalDays: 1,
    repetitionCount: 0,
    easeFactor: DEFAULT_EASE_FACTOR,
    dueDate: '2026-10-19',
    totalAttempts: 0,
    mistakes: 0,
    hintsUsedCount: 0,
  };

  const fixedToday = new Date(2026, 9, 19); // Oct 19, 2026

  it('formats dates consistently to YYYY-MM-DD', () => {
    expect(formatIsoDateOnly(fixedToday)).toBe('2026-10-19');
    expect(formatIsoDateOnly(addDays(fixedToday, 5))).toBe('2026-10-24');
  });

  describe('calculateReviewQuality', () => {
    it('rates clean recall with zero mistakes and zero hints as quality 5', () => {
      const q = calculateReviewQuality({ isCorrect: true, mistakeCount: 0, hintPenaltyScore: 0 });
      expect(q).toBe(5);
    });

    it('rates minor hint (penalty 1) as quality 4', () => {
      const q = calculateReviewQuality({ isCorrect: true, mistakeCount: 0, hintPenaltyScore: 1 });
      expect(q).toBe(4);
    });

    it('rates piece hint or multiple clues (penalty 2-4) as quality 3', () => {
      const q1 = calculateReviewQuality({ isCorrect: true, mistakeCount: 0, hintPenaltyScore: 2 });
      const q2 = calculateReviewQuality({ isCorrect: true, mistakeCount: 0, hintPenaltyScore: 4 });
      expect(q1).toBe(3);
      expect(q2).toBe(3);
    });

    it('rates answer reveal (penalty 5) as quality 2', () => {
      const q = calculateReviewQuality({ isCorrect: true, mistakeCount: 0, hintPenaltyScore: 5 });
      expect(q).toBe(2);
    });

    it('rates answer with mistake as quality 2 or below', () => {
      const q = calculateReviewQuality({ isCorrect: true, mistakeCount: 1, hintPenaltyScore: 0 });
      expect(q).toBe(2);
    });

    it('rates incorrect final answer as quality 0', () => {
      const q = calculateReviewQuality({ isCorrect: false, mistakeCount: 2, hintPenaltyScore: 1 });
      expect(q).toBe(0);
    });
  });

  describe('calculateSm2Update progression', () => {
    it('sets interval to 1 day on first successful repetition (rep = 1)', () => {
      const res = calculateSm2Update(
        { intervalDays: 1, repetitionCount: 0, easeFactor: 2.5 },
        5,
        fixedToday
      );
      expect(res.repetitionCount).toBe(1);
      expect(res.intervalDays).toBe(1);
      expect(res.dueDate).toBe('2026-10-20');
      expect(res.easeFactor).toBe(2.6); // 2.5 + (0.1 - 0) = 2.6
    });

    it('sets interval to 6 days on second successful repetition (rep = 2)', () => {
      const res = calculateSm2Update(
        { intervalDays: 1, repetitionCount: 1, easeFactor: 2.6 },
        5,
        fixedToday
      );
      expect(res.repetitionCount).toBe(2);
      expect(res.intervalDays).toBe(6);
      expect(res.dueDate).toBe('2026-10-25');
    });

    it('multiplies previous interval by ease factor on 3rd+ repetition (rep > 2)', () => {
      // 6 days * 2.6 = 15.6 -> 16 days
      const res = calculateSm2Update(
        { intervalDays: 6, repetitionCount: 2, easeFactor: 2.6 },
        5,
        fixedToday
      );
      expect(res.repetitionCount).toBe(3);
      expect(res.intervalDays).toBe(16);
      expect(res.dueDate).toBe('2026-11-04');
    });

    it('resets interval to 1 day and repetition count to 0 upon failure (quality < 3)', () => {
      const res = calculateSm2Update(
        { intervalDays: 16, repetitionCount: 3, easeFactor: 2.6 },
        2, // quality 2 (e.g. needed answer reveal or made mistake)
        fixedToday
      );
      expect(res.repetitionCount).toBe(0);
      expect(res.intervalDays).toBe(1);
      expect(res.dueDate).toBe('2026-10-20');
      // Ease factor decreases
      expect(res.easeFactor).toBeLessThan(2.6);
      expect(res.easeFactor).toBeGreaterThanOrEqual(MIN_EASE_FACTOR);
    });

    it('strictly clamps ease factor to minimum of 1.3', () => {
      const res = calculateSm2Update(
        { intervalDays: 1, repetitionCount: 0, easeFactor: 1.35 },
        0, // severe failure
        fixedToday
      );
      expect(res.easeFactor).toBe(1.3);
    });
  });

  describe('applySm2Review card mutation', () => {
    it('immutably produces an updated SRSReviewCard with tracked attempts and mistakes', () => {
      const updated = applySm2Review(
        baseCard,
        { isCorrect: true, mistakeCount: 1, hintPenaltyScore: 2 },
        fixedToday
      );

      expect(updated).not.toBe(baseCard);
      expect(updated.totalAttempts).toBe(1);
      expect(updated.mistakes).toBe(1);
      expect(updated.hintsUsedCount).toBe(1);
      expect(updated.lastReviewedAt).toBe(fixedToday.toISOString());
      // Mistakes resulted in quality < 3
      expect(updated.repetitionCount).toBe(0);
      expect(updated.intervalDays).toBe(1);
    });
  });

  describe('isCardDue & getCardMaturity', () => {
    it('correctly determines whether a card is due for review today', () => {
      const dueTodayCard = { ...baseCard, dueDate: '2026-10-19' };
      const overdueCard = { ...baseCard, dueDate: '2026-10-15' };
      const futureCard = { ...baseCard, dueDate: '2026-10-25' };

      expect(isCardDue(dueTodayCard, fixedToday)).toBe(true);
      expect(isCardDue(overdueCard, fixedToday)).toBe(true);
      expect(isCardDue(futureCard, fixedToday)).toBe(false);
    });

    it('categorizes card maturity brackets correctly', () => {
      expect(getCardMaturity(baseCard)).toBe('new');
      expect(getCardMaturity({ ...baseCard, totalAttempts: 1, repetitionCount: 1 })).toBe('learning');
      expect(getCardMaturity({ ...baseCard, totalAttempts: 3, repetitionCount: 2, intervalDays: 6 })).toBe('review');
      expect(getCardMaturity({ ...baseCard, totalAttempts: 5, repetitionCount: 4, intervalDays: 25 })).toBe('mastered');
    });
  });
});
