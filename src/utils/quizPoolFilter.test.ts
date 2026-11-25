import { describe, expect, it } from 'vitest';
import { TacticalQuizCard } from '../types/quiz';
import {
  countByOpening,
  countByType,
  filterQuizCards,
} from './quizPoolFilter';

function card(partial: Partial<TacticalQuizCard>): TacticalQuizCard {
  return {
    id: partial.id ?? 'g1:2',
    sourceGameId: partial.sourceGameId ?? 'g1',
    openingId: partial.openingId ?? 'o1',
    type: partial.type ?? 'attack',
    ply: partial.ply ?? 2,
    startSfen: partial.startSfen ?? 'startpos',
    usiMovesToPosition: partial.usiMovesToPosition ?? ['7g7f', '3c3d'],
    sideToMove: partial.sideToMove ?? 'b',
    bestMove: partial.bestMove ?? '2g2f',
    pv: partial.pv ?? ['2g2f', '8c8d', '2f2e'],
    scoreCpBefore: partial.scoreCpBefore ?? 250,
    isEnabled: partial.isEnabled ?? true,
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00Z',
    ...partial,
  };
}

describe('quizPoolFilter', () => {
  const cards: TacticalQuizCard[] = [
    card({ id: '1', sourceGameId: 'g1', openingId: 'o1', type: 'attack', isEnabled: true }),
    card({ id: '2', sourceGameId: 'g1', openingId: 'o1', type: 'defense', isEnabled: false }),
    card({ id: '3', sourceGameId: 'g2', openingId: 'o2', type: 'race', isEnabled: true }),
    card({ id: '4', sourceGameId: 'g2', openingId: 'o2', type: 'mate', isEnabled: true }),
  ];

  it('1: returns all cards in same order when filter is empty', () => {
    expect(filterQuizCards(cards, {})).toEqual(cards);
  });

  it('2: filters by type (only mate cards)', () => {
    const res = filterQuizCards(cards, { type: 'mate' });
    expect(res).toHaveLength(1);
    expect(res[0]?.id).toBe('4');
  });

  it('3: filters by openingId and enabledOnly', () => {
    const res = filterQuizCards(cards, { openingId: 'o1', enabledOnly: true });
    expect(res).toHaveLength(1);
    expect(res[0]?.id).toBe('1');
  });

  it('4: returns empty array when gameId matches nothing', () => {
    expect(filterQuizCards(cards, { gameId: 'zzz' })).toEqual([]);
  });

  it('5: countByOpening computes totals and enabled counts correctly', () => {
    const res = countByOpening(cards);
    expect(res).toEqual({
      o1: { total: 2, enabled: 1 },
      o2: { total: 2, enabled: 2 },
    });
  });

  it('6: countByType on empty array returns all 4 keys with zero', () => {
    expect(countByType([])).toEqual({
      attack: 0,
      defense: 0,
      race: 0,
      mate: 0,
    });
  });

  it('7: countByType counts each category correctly', () => {
    expect(countByType(cards)).toEqual({
      attack: 1,
      defense: 1,
      race: 1,
      mate: 1,
    });
  });
});
