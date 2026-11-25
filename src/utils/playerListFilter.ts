/**
 * Pure filtering, game-count aggregation, and sorting utilities for PlayersPage (Issue #56).
 * Computes game counts in a single O(R) pass over KifuRecords so 100+ players render fast.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import type { KifuRecord } from '../types/kifuRecord';
import type { PlayerCategory, ShogiPlayerProfile } from '../types/player';

export type PlayerSortField = 'gameCount' | 'name' | 'title';
export type PlayerSortDirection = 'asc' | 'desc';

export interface PlayerWithGameCount {
  profile: ShogiPlayerProfile;
  gameCount: number;
}

/**
 * Counts how many KifuRecords reference each player ID (either Sente or Gote).
 */
export function buildPlayerGameCounts(
  records: Pick<KifuRecord, 'sentePlayerId' | 'gotePlayerId'>[]
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const rec of records) {
    if (rec.sentePlayerId) {
      counts.set(rec.sentePlayerId, (counts.get(rec.sentePlayerId) ?? 0) + 1);
    }
    if (rec.gotePlayerId && rec.gotePlayerId !== rec.sentePlayerId) {
      counts.set(rec.gotePlayerId, (counts.get(rec.gotePlayerId) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Filters and sorts player profiles by category, search query, and sort field.
 */
export function filterAndSortPlayers(
  profiles: ShogiPlayerProfile[],
  gameCounts: Map<string, number>,
  options: {
    category: 'all' | PlayerCategory;
    query: string;
    sortField: PlayerSortField;
    sortDirection: PlayerSortDirection;
  }
): PlayerWithGameCount[] {
  const q = options.query.trim().toLowerCase();
  const dir = options.sortDirection === 'asc' ? 1 : -1;

  const filtered: PlayerWithGameCount[] = [];
  for (const profile of profiles) {
    if (options.category !== 'all' && profile.category !== options.category) {
      continue;
    }
    if (q) {
      const haystack = [
        profile.name,
        profile.title ?? '',
        profile.note ?? '',
        ...(profile.aliases ?? []),
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) continue;
    }
    filtered.push({
      profile,
      gameCount: gameCounts.get(profile.id) ?? 0,
    });
  }

  filtered.sort((a, b) => {
    let cmp = 0;
    if (options.sortField === 'gameCount') {
      cmp = a.gameCount - b.gameCount;
    } else if (options.sortField === 'title') {
      cmp = (a.profile.title ?? '').localeCompare(b.profile.title ?? '');
    } else {
      cmp = a.profile.name.localeCompare(b.profile.name);
    }
    if (cmp !== 0) return cmp * dir;
    return a.profile.name.localeCompare(b.profile.name);
  });

  return filtered;
}
