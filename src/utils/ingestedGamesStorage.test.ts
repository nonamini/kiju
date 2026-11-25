import { beforeEach, describe, expect, it } from 'vitest';
import { getSafeStorage } from './matchHistoryStorage';
import {
  INGESTED_GAMES_STORAGE_KEY,
  loadIngestedGames,
  loadLegacyIngestedGamesRaw,
  saveIngestedGames,
} from './ingestedGamesStorage';
import { KIFU_RECORDS_STORAGE_KEY, loadKifuRecords, saveKifuRecord } from './kifuRecordStorage';
import { GameMergeInput } from './treeMerger';
import { IngestedGame } from '../types/tree';
import { ShogiMove } from '../types/shogi';
import { KifuRecord } from '../types/kifuRecord';

const VALID_KIF = `手合割：平手
先手：テスト一
後手：テスト二
手数----指手---------消費時間--
1 ７六歩(77)
2 ３四歩(33)
3 ２六歩(27)
4 ８四歩(83)
`;

const EVAL = { scoreCp: 80, depth: 12, evaluatedAt: '2026-01-01T00:00:00Z' };

function createMove(ply: number, withEval = false): ShogiMove {
  return {
    ply,
    color: ply % 2 === 1 ? 'b' : 'w',
    to: { file: 7, rank: 6 },
    piece: 'FU',
    isDrop: false,
    kifString: '７六歩',
    sfenMove: '7g7f',
    ...(withEval ? { evaluation: EVAL } : {}),
  };
}

function createInput(id: string, overrides: Partial<IngestedGame> = {}): GameMergeInput {
  const game: IngestedGame = {
    id,
    userId: 'user-main',
    openingId: 'kakugawari',
    title: `Ingested ${id}`,
    date: '2025-12-01',
    senteName: 'S',
    goteName: 'G',
    winner: 'b',
    plyCount: 4,
    rawKif: VALID_KIF,
    isIncluded: true,
    isAnalyzed: true,
    createdAt: '2025-12-01T00:00:00.000Z',
    updatedAt: '2025-12-01T00:00:00.000Z',
    ...overrides,
  };
  return { game, moves: [createMove(1, true), createMove(2)], variations: [] };
}

describe('ingestedGamesStorage (KifuRecord backend)', () => {
  beforeEach(() => {
    const storage = getSafeStorage();
    storage.removeItem(KIFU_RECORDS_STORAGE_KEY);
    storage.removeItem(INGESTED_GAMES_STORAGE_KEY);
  });

  it('saveIngestedGames persists tree records into KifuRecord storage', () => {
    saveIngestedGames([createInput('ig-1')]);

    // Legacy key must NOT be written anymore
    expect(getSafeStorage().getItem(INGESTED_GAMES_STORAGE_KEY)).toBeNull();

    const records = loadKifuRecords();
    expect(records).toHaveLength(1);
    const rec = records[0]!;
    expect(rec.id).toBe('ig-1');
    expect(rec.source).toBe('tree');
    expect(rec.originIngestedGameId).toBe('ig-1');
    expect(rec.evaluations?.[1]).toEqual(EVAL);
    expect(rec.analysisStatus).toBe('completed');
    expect(rec.isIncludedInTree).toBe(true);
  });

  it('loadIngestedGames rehydrates moves from rawKif and reinjects evaluations', () => {
    saveIngestedGames([createInput('ig-1')]);

    const games = loadIngestedGames();
    expect(games).toHaveLength(1);
    const item = games[0]!;
    expect(item.game.id).toBe('ig-1');
    expect(item.game.isIncluded).toBe(true);
    expect(item.game.isAnalyzed).toBe(true);
    expect(item.game.winner).toBe('b');
    // Moves re-parsed from rawKif: 4 plies from VALID_KIF
    expect(item.moves.length).toBe(4);
    // Evaluation at ply 1 re-injected from record.evaluations
    expect(item.moves[0]!.evaluation).toEqual(EVAL);
    expect(item.moves[1]!.evaluation).toBeUndefined();
  });

  it('preserves non-tree KifuRecords when saving ingested games', () => {
    const studioRecord: KifuRecord = {
      id: 'sg-1',
      title: 'Studio',
      contentHash: 'x',
      source: 'studio',
      senteName: 'A',
      goteName: 'B',
      openingId: 'yagura',
      openingName: '矢倉',
      totalPlies: 0,
      jkfJson: '{}',
      tags: [],
      isIncludedInTree: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    saveKifuRecord(studioRecord);

    saveIngestedGames([createInput('ig-1'), createInput('ig-2')]);

    const records = loadKifuRecords();
    expect(records).toHaveLength(3);
    expect(records.find((r) => r.id === 'sg-1')?.source).toBe('studio');
    expect(records.filter((r) => r.source === 'tree')).toHaveLength(2);
  });

  it('removes tree records absent from the saved list (deletion propagates)', () => {
    saveIngestedGames([createInput('ig-1'), createInput('ig-2')]);
    saveIngestedGames([createInput('ig-1')]);

    const records = loadKifuRecords();
    expect(records).toHaveLength(1);
    expect(records[0]!.id).toBe('ig-1');
  });

  it('round-trips user edits (title, isIncluded=false) through the record', () => {
    saveIngestedGames([createInput('ig-1')]);
    const [loaded] = loadIngestedGames();
    loaded!.game.title = 'Renamed';
    loaded!.game.isIncluded = false;
    saveIngestedGames([loaded!]);

    const rec = loadKifuRecords()[0]!;
    expect(rec.title).toBe('Renamed');
    expect(rec.isIncludedInTree).toBe(false);
    const [view] = loadIngestedGames();
    expect(view!.game.isIncluded).toBe(false);
  });

  it('loadLegacyIngestedGamesRaw still reads the old key for migration', () => {
    const legacy = [createInput('legacy-1')];
    getSafeStorage().setItem(INGESTED_GAMES_STORAGE_KEY, JSON.stringify(legacy));
    const raw = loadLegacyIngestedGamesRaw();
    expect(raw).toHaveLength(1);
    expect(raw[0]!.game.id).toBe('legacy-1');
    expect(loadIngestedGames()).toHaveLength(0); // KifuRecord store is empty
  });
});
