import { beforeEach, describe, expect, it } from 'vitest';
import { TacticalQuizCard } from '../types/quiz';
import { getSafeStorage } from './matchHistoryStorage';
import {
  clearQuizPool,
  deleteQuizCard,
  DELETED_QUIZ_IDS_KEY,
  loadDeletedQuizIds,
  loadQuizPool,
  mergeQuizCards,
  QUIZ_POOL_STORAGE_KEY,
  saveQuizCard,
  saveQuizPool,
  setQuizEnabled,
} from './quizPoolStorage';
import { regenerateAllStudioQuizzes } from './studioQuizExtractor';

function createDummyCard(id: string, isEnabled = true): TacticalQuizCard {
  return {
    id,
    sourceGameId: 'game-1',
    openingId: 'yagura',
    type: 'attack',
    ply: 20,
    startSfen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
    usiMovesToPosition: ['7g7f', '3c3d'],
    sideToMove: 'b',
    bestMove: '2g2f',
    pv: ['2g2f'],
    scoreCpBefore: 100,
    actualMove: '2g2f',
    isEnabled,
    createdAt: '2026-10-25T10:00:00Z',
  };
}

describe('quizPoolStorage', () => {
  beforeEach(() => {
    getSafeStorage().removeItem(QUIZ_POOL_STORAGE_KEY);
    getSafeStorage().removeItem(DELETED_QUIZ_IDS_KEY);
  });

  it('supports single card save, delete with cloud tombstones, and preserving manual cards on regenerate', () => {
    const manualCard: TacticalQuizCard = {
      ...createDummyCard('manual_quiz_1'),
      source: 'manual',
      sourceGameId: 'manual',
      openingId: 'manual',
      ply: 0,
      usiMovesToPosition: [],
      title: 'My Custom Quiz',
    };
    saveQuizCard(manualCard);
    const extracted = createDummyCard('g1:10');
    saveQuizCard({ ...extracted, source: 'kifu-extract' });

    expect(loadQuizPool().map((c) => c.id)).toContain('manual_quiz_1');

    // Regenerating extracted quizzes from empty analyzed list must preserve manual card
    regenerateAllStudioQuizzes([]);
    const afterRegen = loadQuizPool();
    expect(afterRegen.map((c) => c.id)).toEqual(['manual_quiz_1']);

    // Deleting manual card records tombstone; saving again clears it
    deleteQuizCard('manual_quiz_1');
    expect(loadQuizPool()).toEqual([]);
    expect(loadDeletedQuizIds()).toEqual(['manual_quiz_1']);

    saveQuizCard(manualCard);
    expect(loadDeletedQuizIds()).toEqual([]);

    clearQuizPool();
    expect(loadDeletedQuizIds()).toEqual(['manual_quiz_1']);
  });

  it('loads empty array when storage is empty or JSON is corrupted', () => {
    expect(loadQuizPool()).toEqual([]);

    getSafeStorage().setItem(QUIZ_POOL_STORAGE_KEY, '{corrupted-json');
    expect(loadQuizPool()).toEqual([]);

    getSafeStorage().setItem(QUIZ_POOL_STORAGE_KEY, JSON.stringify({ notAnArray: true }));
    expect(loadQuizPool()).toEqual([]);
  });

  it('persists and restores quiz cards correctly', () => {
    const cards = [createDummyCard('c1'), createDummyCard('c2', false)];
    saveQuizPool(cards);

    const loaded = loadQuizPool();
    expect(loaded).toHaveLength(2);
    expect(loaded[0]!.id).toBe('c1');
    expect(loaded[0]!.isEnabled).toBe(true);
    expect(loaded[1]!.id).toBe('c2');
    expect(loaded[1]!.isEnabled).toBe(false);
  });

  it('merges fresh cards while preserving user-disabled status on existing cards', () => {
    const existing = [
      createDummyCard('c1', false), // user disabled
      createDummyCard('c2', true),
      createDummyCard('old-only', true),
    ];

    const fresh = [
      { ...createDummyCard('c1', true), scoreCpBefore: 250 },
      createDummyCard('c3', true), // new card
    ];

    const merged = mergeQuizCards(existing, fresh);

    // c1 preserved isEnabled = false from existing, but has updated score
    const c1 = merged.find((c) => c.id === 'c1');
    expect(c1).toBeDefined();
    expect(c1?.isEnabled).toBe(false);
    expect(c1?.scoreCpBefore).toBe(250);

    // old-only card preserved
    const oldOnly = merged.find((c) => c.id === 'old-only');
    expect(oldOnly).toBeDefined();

    // c3 added
    const c3 = merged.find((c) => c.id === 'c3');
    expect(c3).toBeDefined();
    expect(c3?.isEnabled).toBe(true);

    // c2 preserved
    const c2 = merged.find((c) => c.id === 'c2');
    expect(c2).toBeDefined();
  });

  it('setQuizEnabled immutably updates enabled flags for targeted ids', () => {
    const original = [
      createDummyCard('c1', false),
      createDummyCard('c2', false),
      createDummyCard('c3', true),
    ];

    const updated = setQuizEnabled(original, ['c1', 'c2'], true);

    expect(updated).not.toBe(original);
    expect(original[0]!.isEnabled).toBe(false);
    expect(updated[0]!.isEnabled).toBe(true);
    expect(updated[1]!.isEnabled).toBe(true);
    expect(updated[2]!.isEnabled).toBe(true);

    const disabled = setQuizEnabled(updated, ['c3'], false);
    expect(disabled[2]!.isEnabled).toBe(false);
  });
});
