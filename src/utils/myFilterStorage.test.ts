import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_KIFU_LIBRARY_FILTER } from './kifuLibraryFilter';
import { getSafeStorage } from './matchHistoryStorage';
import {
  MY_FILTERS_STORAGE_KEY,
  clearMyFilters,
  deleteMyFilter,
  loadKifuMyFilters,
  loadMyFilters,
  loadPlayerMyFilters,
  saveKifuMyFilter,
  savePlayerMyFilter,
} from './myFilterStorage';

describe('myFilterStorage', () => {
  beforeEach(() => {
    getSafeStorage().clear();
    clearMyFilters();
  });

  it('saves and isolates kifu and player filter presets by scope', () => {
    const kifuPreset = saveKifuMyFilter({
      name: 'Pro Ranging Rook',
      filter: {
        ...DEFAULT_KIFU_LIBRARY_FILTER,
        gameKind: 'pro',
        openingId: 'sikenbisha',
        favoriteOnly: true,
      },
      sortField: 'matchDate',
      sortDirection: 'desc',
    });

    const playerPreset = savePlayerMyFilter({
      name: 'Active AI Engines',
      filter: {
        category: 'ai',
        query: 'stockfish',
        sortField: 'gameCount',
        sortDirection: 'desc',
      },
    });

    const kifuList = loadKifuMyFilters();
    const playerList = loadPlayerMyFilters();

    expect(kifuList).toHaveLength(1);
    expect(kifuList[0]?.id).toBe(kifuPreset.id);
    expect(kifuList[0]?.filter.gameKind).toBe('pro');
    expect(kifuList[0]?.sortField).toBe('matchDate');

    expect(playerList).toHaveLength(1);
    expect(playerList[0]?.id).toBe(playerPreset.id);
    expect(playerList[0]?.filter.category).toBe('ai');
    expect(playerList[0]?.filter.query).toBe('stockfish');
  });

  it('updates an existing preset when saving with matching id and preserves createdAt', () => {
    const created = saveKifuMyFilter({
      id: 'preset-fixed-1',
      name: 'Initial Name',
      filter: { ...DEFAULT_KIFU_LIBRARY_FILTER, favoriteOnly: true },
    });

    const updated = saveKifuMyFilter({
      id: 'preset-fixed-1',
      name: 'Updated Name',
      filter: { ...DEFAULT_KIFU_LIBRARY_FILTER, winner: 'sente' },
    });

    const all = loadKifuMyFilters();
    expect(all).toHaveLength(1);
    expect(updated.id).toBe('preset-fixed-1');
    expect(updated.name).toBe('Updated Name');
    expect(updated.filter.winner).toBe('sente');
    expect(updated.createdAt).toBe(created.createdAt);
  });

  it('deletes presets cleanly by id', () => {
    const first = saveKifuMyFilter({
      name: 'Filter 1',
      filter: DEFAULT_KIFU_LIBRARY_FILTER,
    });
    const second = savePlayerMyFilter({
      name: 'Filter 2',
      filter: {
        category: 'pro',
        query: '',
        sortField: 'name',
        sortDirection: 'asc',
      },
    });

    deleteMyFilter(first.id);
    expect(loadKifuMyFilters()).toHaveLength(0);
    expect(loadPlayerMyFilters()).toHaveLength(1);
    expect(loadMyFilters().map((p) => p.id)).toEqual([second.id]);
  });

  it('returns empty list on corrupt JSON storage', () => {
    getSafeStorage().setItem(MY_FILTERS_STORAGE_KEY, '{not-valid-json');
    expect(loadMyFilters()).toEqual([]);
  });
});
