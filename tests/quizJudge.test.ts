import { describe, it, expect } from 'vitest';
import {
  judgeByPv,
  judgeByScore,
  pickHintChoices,
  hintPenaltyFor,
} from '../src/utils/quizJudge';
import { TacticalQuizCard } from '../src/types/quiz';
import { INITIAL_HIRATE_SFEN } from '../src/utils/shogiBoard';

describe('quizJudge helpers', () => {
  const sampleCard: TacticalQuizCard = {
    id: 'quiz-test-1',
    sourceGameId: 'game-001',
    openingId: 'kakugawari',
    type: 'attack',
    ply: 24,
    startSfen: INITIAL_HIRATE_SFEN,
    usiMovesToPosition: ['7g7f', '3c3d'],
    sideToMove: 'b',
    bestMove: '2g2f',
    pv: ['2g2f', '8c8d', '2f2e'],
    scoreCpBefore: 200,
    isEnabled: true,
    createdAt: '2026-10-25T10:00:00Z',
  };

  describe('judgeByPv', () => {
    it('returns "best" on exact match', () => {
      expect(judgeByPv('2g2f', '2g2f')).toBe('best');
      expect(judgeByPv(' 2g2f ', '2g2f')).toBe('best');
    });

    it('returns null on mismatch', () => {
      expect(judgeByPv('7g7f', '2g2f')).toBeNull();
    });
  });

  describe('judgeByScore', () => {
    it('returns "acceptable" for Sente when score is within 50cp tolerance', () => {
      expect(judgeByScore('b', 180, 200)).toBe('acceptable');
    });

    it('returns "wrong" for Sente when score drop exceeds 50cp tolerance', () => {
      expect(judgeByScore('b', 100, 200)).toBe('wrong');
    });

    it('returns "acceptable" for Gote when score is within 50cp tolerance', () => {
      // For Gote, scoreCpAfterUserMove = -180 means solver view = 180
      expect(judgeByScore('w', -180, 200)).toBe('acceptable');
    });

    it('returns "wrong" for Gote when score drop exceeds 50cp tolerance', () => {
      // For Gote, scoreCpAfterUserMove = 100 means solver view = -100
      expect(judgeByScore('w', 100, 200)).toBe('wrong');
    });
  });

  describe('pickHintChoices', () => {
    it('returns exactly 3 choices including bestMove without duplicates', () => {
      const candidates = ['7g7f', '2h6h', '6i7h', '5i5h', '2g2f'];
      const choices = pickHintChoices(sampleCard, candidates);

      expect(choices).toHaveLength(3);
      expect(choices).toContain('2g2f');
      expect(new Set(choices).size).toBe(3);
    });

    it('produces identical deterministic output for the same input', () => {
      const candidates = ['7g7f', '2h6h', '6i7h', '5i5h', '2g2f'];
      const choices1 = pickHintChoices(sampleCard, candidates);
      const choices2 = pickHintChoices(sampleCard, candidates);

      expect(choices1).toEqual(choices2);
    });

    it('handles cases with fewer than 2 distractors gracefully', () => {
      const choices = pickHintChoices(sampleCard, ['2g2f']);
      expect(choices).toEqual(['2g2f']);
    });
  });

  describe('hintPenaltyFor', () => {
    it('computes correct penalties according to usage', () => {
      expect(hintPenaltyFor(false, false)).toBe(0);
      expect(hintPenaltyFor(true, false)).toBe(2);
      expect(hintPenaltyFor(true, true)).toBe(5);
      expect(hintPenaltyFor(false, true)).toBe(5);
    });
  });
});
