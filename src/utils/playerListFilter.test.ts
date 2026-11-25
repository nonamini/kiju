import { describe, expect, it } from 'vitest';
import type { ShogiPlayerProfile } from '../types/player';
import {
  buildPlayerGameCounts,
  filterAndSortPlayers,
} from './playerListFilter';

function makePlayer(
  id: string,
  name: string,
  category: ShogiPlayerProfile['category'],
  overrides: Partial<ShogiPlayerProfile> = {}
): ShogiPlayerProfile {
  const now = '2026-11-16T00:00:00.000Z';
  return {
    id,
    name,
    category,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('playerListFilter (Issue #56)', () => {
  it('computes per-player game counts in one pass without double-counting self-play', () => {
    const counts = buildPlayerGameCounts([
      { sentePlayerId: 'p1', gotePlayerId: 'p2' },
      { sentePlayerId: 'p1', gotePlayerId: 'p1' },
      { sentePlayerId: 'p3', gotePlayerId: undefined },
    ]);
    expect(counts.get('p1')).toBe(2);
    expect(counts.get('p2')).toBe(1);
    expect(counts.get('p3')).toBe(1);
  });

  it('filters by category and text query across name, aliases, title, and note, and sorts 120+ players quickly', () => {
    const players: ShogiPlayerProfile[] = Array.from({ length: 120 }, (_, i) =>
      makePlayer(`p-${i}`, `Player ${i}`, i % 3 === 0 ? 'pro' : i % 3 === 1 ? 'ai' : 'user', {
        title: i === 0 ? '竜王・名人' : undefined,
        aliases: i === 3 ? ['藤井聡太 竜王'] : undefined,
      })
    );
    const counts = buildPlayerGameCounts([
      { sentePlayerId: 'p-0', gotePlayerId: 'p-3' },
      { sentePlayerId: 'p-0', gotePlayerId: 'p-6' },
    ]);

    const t0 = performance.now();
    const proSorted = filterAndSortPlayers(players, counts, {
      category: 'pro',
      query: '',
      sortField: 'gameCount',
      sortDirection: 'desc',
    });
    const elapsed = performance.now() - t0;

    expect(proSorted.length).toBe(40);
    expect(proSorted[0]?.profile.id).toBe('p-0');
    expect(proSorted[0]?.gameCount).toBe(2);
    expect(elapsed).toBeLessThan(50);

    const aliasMatch = filterAndSortPlayers(players, counts, {
      category: 'all',
      query: '藤井聡太',
      sortField: 'name',
      sortDirection: 'asc',
    });
    expect(aliasMatch.map((x) => x.profile.id)).toEqual(['p-3']);
  });
});
