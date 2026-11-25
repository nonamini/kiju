import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyQuizResult,
  loadQuizProgress,
  pickNextQuiz,
  QUIZ_PROGRESS_STORAGE_KEY,
  saveQuizProgress,
} from '../src/utils/quizProgressStorage';
import { TacticalQuizCard } from '../src/types/quiz';
import { INITIAL_HIRATE_SFEN } from '../src/utils/shogiBoard';
import { getSafeStorage } from '../src/utils/matchHistoryStorage';

describe('quizProgressStorage', () => {
  beforeEach(() => {
    getSafeStorage().removeItem(QUIZ_PROGRESS_STORAGE_KEY);
  });

  const baseCard = (id: string, ply: number, isEnabled = true): TacticalQuizCard => ({
    id,
    sourceGameId: 'game-001',
    openingId: 'kakugawari',
    type: 'attack',
    ply,
    startSfen: INITIAL_HIRATE_SFEN,
    usiMovesToPosition: ['7g7f', '3c3d'],
    sideToMove: 'b',
    bestMove: '2g2f',
    pv: ['2g2f', '8c8d'],
    scoreCpBefore: 200,
    isEnabled,
    createdAt: '2026-10-25T10:00:00Z',
  });

  describe('loadQuizProgress and saveQuizProgress', () => {
    it('returns empty object when storage is empty or corrupted', () => {
      expect(loadQuizProgress()).toEqual({});

      getSafeStorage().setItem(QUIZ_PROGRESS_STORAGE_KEY, 'invalid-json');
      expect(loadQuizProgress()).toEqual({});
    });

    it('persists and retrieves progress records accurately', () => {
      const records = {
        'card-1': {
          cardId: 'card-1',
          attempts: 2,
          correctCount: 2,
          intervalDays: 6,
          repetitionCount: 2,
          easeFactor: 2.6,
          dueDate: '2026-10-31',
          lastQuality: 5,
          lastAttemptAt: '2026-10-25T12:00:00.000Z',
        },
      };

      saveQuizProgress(records);
      expect(loadQuizProgress()).toEqual(records);
    });
  });

  describe('applyQuizResult', () => {
    it('initializes new progress correctly on successful first attempt', () => {
      const fixedDate = new Date('2026-10-25T12:00:00.000Z');
      const progress = applyQuizResult(undefined, 'card-new', 5, fixedDate);

      expect(progress.cardId).toBe('card-new');
      expect(progress.attempts).toBe(1);
      expect(progress.correctCount).toBe(1);
      expect(progress.repetitionCount).toBe(1);
      expect(progress.intervalDays).toBe(1);
      expect(progress.dueDate).toBe('2026-10-26');
      expect(progress.lastQuality).toBe(5);
    });

    it('resets interval and repetitions on failed review (quality < 3)', () => {
      const fixedDate = new Date('2026-10-25T12:00:00.000Z');
      const prev = {
        cardId: 'card-fail',
        attempts: 3,
        correctCount: 3,
        intervalDays: 15,
        repetitionCount: 3,
        easeFactor: 2.5,
        dueDate: '2026-10-25',
        lastQuality: 4,
        lastAttemptAt: '2026-10-10T12:00:00.000Z',
      };

      const updated = applyQuizResult(prev, 'card-fail', 1, fixedDate);
      expect(updated.attempts).toBe(4);
      expect(updated.correctCount).toBe(3); // does not increment
      expect(updated.repetitionCount).toBe(0); // reset
      expect(updated.intervalDays).toBe(1); // 1-day retry
      expect(updated.dueDate).toBe('2026-10-26');
      expect(updated.lastQuality).toBe(1);
    });
  });

  describe('pickNextQuiz', () => {
    it('prefers due cards over unseen cards, ordered by earliest due date', () => {
      const cardDueTomorrow = baseCard('card-due-27', 20);
      const cardDueToday = baseCard('card-due-25', 50);
      const cardUnseen = baseCard('card-unseen', 10);

      const progress = {
        'card-due-27': {
          cardId: 'card-due-27',
          attempts: 1,
          correctCount: 1,
          intervalDays: 1,
          repetitionCount: 1,
          easeFactor: 2.5,
          dueDate: '2026-10-27',
          lastQuality: 4,
          lastAttemptAt: '2026-10-25T12:00:00.000Z',
        },
        'card-due-25': {
          cardId: 'card-due-25',
          attempts: 1,
          correctCount: 1,
          intervalDays: 1,
          repetitionCount: 1,
          easeFactor: 2.5,
          dueDate: '2026-10-25',
          lastQuality: 4,
          lastAttemptAt: '2026-10-24T12:00:00.000Z',
        },
      };

      const selected = pickNextQuiz(
        [cardDueTomorrow, cardDueToday, cardUnseen],
        progress,
        '2026-10-25'
      );

      expect(selected?.id).toBe('card-due-25');
    });

    it('picks unseen cards sorted by lowest ply when no cards are due', () => {
      const cardPly30 = baseCard('unseen-30', 30);
      const cardPly10 = baseCard('unseen-10', 10);

      const selected = pickNextQuiz([cardPly30, cardPly10], {}, '2026-10-25');
      expect(selected?.id).toBe('unseen-10');
    });

    it('excludes disabled cards and excludeId', () => {
      const cardDisabled = baseCard('disabled-1', 10, false);
      const cardExcluded = baseCard('excluded-1', 12, true);
      const cardActive = baseCard('active-1', 14, true);

      const selected = pickNextQuiz(
        [cardDisabled, cardExcluded, cardActive],
        {},
        '2026-10-25',
        'excluded-1'
      );

      expect(selected?.id).toBe('active-1');
    });

    it('returns null when no eligible cards remain', () => {
      const selected = pickNextQuiz([], {}, '2026-10-25');
      expect(selected).toBeNull();
    });
  });
});
