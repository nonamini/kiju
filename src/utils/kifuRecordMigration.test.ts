import { beforeEach, describe, expect, it } from 'vitest';
import { getSafeStorage } from './matchHistoryStorage';
import { INGESTED_GAMES_STORAGE_KEY } from './ingestedGamesStorage';
import {
  KIFU_RECORDS_STORAGE_KEY,
  loadKifuRecords,
  saveKifuRecord,
} from './kifuRecordStorage';
import { migrateLegacyKifuData } from './kifuRecordMigration';
import {
  STUDIO_GAMES_LEGACY_KEY,
  STUDIO_GAMES_STORAGE_KEY,
  SavedStudioGame,
} from './studioKifuStorage';
import { GameMergeInput } from './treeMerger';
import { IngestedGame } from '../types/tree';
import { ShogiMove } from '../types/shogi';

const VALID_KIF = `手合割：平手
先手：テスト一
後手：テスト二
手数----指手---------消費時間--
1 ７六歩(77)
2 ３四歩(33)
3 ２六歩(27)
4 ８四歩(83)
`;

function createStudioGame(id: string, overrides: Partial<SavedStudioGame> = {}): SavedStudioGame {
  return {
    id,
    title: `Studio Game ${id}`,
    senteName: '藤井聡太',
    goteName: '伊藤匠',
    openingId: 'aigakari',
    openingName: '相掛かり',
    totalPlies: 4,
    forkCount: 0,
    jkfJson: '{}',
    rawKif: VALID_KIF,
    tags: ['研究'],
    evaluations: { 1: { scoreCp: 30, depth: 12, evaluatedAt: '2026-01-01T00:00:00Z' } },
    analysisStatus: 'completed',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function createIngestedInput(id: string, overrides: Partial<IngestedGame> = {}): GameMergeInput {
  const game: IngestedGame = {
    id,
    userId: 'user-main',
    openingId: 'kakugawari',
    title: `Ingested ${id}`,
    date: '2025-12-01',
    senteName: '羽生善治',
    goteName: '渡辺明',
    tournament: '名人戦',
    winner: 'b',
    plyCount: 4,
    rawKif: VALID_KIF,
    isIncluded: true,
    isAnalyzed: false,
    createdAt: '2025-12-01T00:00:00.000Z',
    updatedAt: '2025-12-01T00:00:00.000Z',
    ...overrides,
  };
  return { game, moves: [] };
}

function seedLegacyStudioGames(games: SavedStudioGame[]): void {
  getSafeStorage().setItem(STUDIO_GAMES_STORAGE_KEY, JSON.stringify(games));
}

function seedLegacyIngestedGames(items: GameMergeInput[]): void {
  getSafeStorage().setItem(INGESTED_GAMES_STORAGE_KEY, JSON.stringify(items));
}

function createMove(ply: number, withEval = false): ShogiMove {
  return {
    ply,
    color: ply % 2 === 1 ? 'b' : 'w',
    to: { file: 7, rank: 6 },
    piece: 'FU',
    isDrop: false,
    kifString: '７六歩',
    sfenMove: '7g7f',
    ...(withEval
      ? { evaluation: { scoreCp: 55, depth: 10, evaluatedAt: '2026-01-01T00:00:00Z' } }
      : {}),
  };
}

describe('kifuRecordMigration', () => {
  beforeEach(() => {
    const storage = getSafeStorage();
    storage.removeItem(KIFU_RECORDS_STORAGE_KEY);
    storage.removeItem(STUDIO_GAMES_STORAGE_KEY);
    storage.removeItem(STUDIO_GAMES_LEGACY_KEY);
    storage.removeItem(INGESTED_GAMES_STORAGE_KEY);
  });

  it('migrates a SavedStudioGame into a KifuRecord with mapped fields', () => {
    seedLegacyStudioGames([createStudioGame('sg-1')]);

    const result = migrateLegacyKifuData();
    expect(result.migrated).toBe(1);
    expect(result.errors).toBe(0);

    const records = loadKifuRecords();
    expect(records).toHaveLength(1);
    const rec = records[0]!;
    expect(rec.id).toBe('sg-1');
    expect(rec.source).toBe('studio');
    expect(rec.originStudioGameId).toBe('sg-1');
    expect(rec.senteName).toBe('藤井聡太');
    expect(rec.tags).toEqual(['研究']);
    expect(rec.analysisStatus).toBe('completed');
    expect(rec.evaluations?.[1]?.scoreCp).toBe(30);
    expect(rec.isIncludedInTree).toBe(false);
    expect(rec.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('migrates an ingested game into a KifuRecord with generated jkfJson', () => {
    seedLegacyIngestedGames([createIngestedInput('ig-1')]);

    const result = migrateLegacyKifuData();
    expect(result.migrated).toBe(1);

    const rec = loadKifuRecords()[0]!;
    expect(rec.source).toBe('tree');
    expect(rec.originIngestedGameId).toBe('ig-1');
    expect(rec.winner).toBe('sente'); // 'b' -> 'sente'
    expect(rec.matchDate).toBe('2025-12-01');
    expect(rec.isIncludedInTree).toBe(true);
    expect(rec.analysisStatus).toBe('unanalyzed');
    // jkfJson generated from rawKif should be a real JKF object, not '{}'
    expect(rec.jkfJson).not.toBe('{}');
    const parsed = JSON.parse(rec.jkfJson) as { moves?: unknown[] };
    expect(Array.isArray(parsed.moves)).toBe(true);
  });

  it('harvests move.evaluation into KifuRecord.evaluations (#42b)', () => {
    const item = createIngestedInput('ig-eval', { isAnalyzed: false });
    item.moves = [createMove(1, true), createMove(2), createMove(3, true)];
    seedLegacyIngestedGames([item]);

    const result = migrateLegacyKifuData();
    expect(result.migrated).toBe(1);

    const rec = loadKifuRecords()[0]!;
    expect(rec.evaluations?.[1]?.scoreCp).toBe(55);
    expect(rec.evaluations?.[3]?.scoreCp).toBe(55);
    expect(rec.evaluations?.[2]).toBeUndefined();
    expect(rec.analyzedPliesCount).toBe(2);
    // evaluations present => treated as analyzed even when flag was stale
    expect(rec.analysisStatus).toBe('completed');
  });

  it('backfills evaluations for records migrated before harvesting existed', () => {
    // Simulate a record already migrated by the pre-#42b code path
    saveKifuRecord({
      id: 'ig-old',
      title: 'Old Ingested',
      contentHash: 'x',
      source: 'tree',
      senteName: 'A',
      goteName: 'B',
      openingId: 'kakugawari',
      openingName: '角換わり',
      totalPlies: 3,
      jkfJson: '{}',
      tags: [],
      isIncludedInTree: true,
      analysisStatus: 'unanalyzed',
      createdAt: '2025-12-01T00:00:00.000Z',
      updatedAt: '2025-12-01T00:00:00.000Z',
      originIngestedGameId: 'ig-old',
    });
    const item = createIngestedInput('ig-old');
    item.moves = [createMove(1, true), createMove(2), createMove(3)];
    seedLegacyIngestedGames([item]);

    const result = migrateLegacyKifuData();
    expect(result.migrated).toBe(0);
    expect(result.skipped).toBe(1);

    const rec = loadKifuRecords()[0]!;
    expect(rec.evaluations?.[1]?.scoreCp).toBe(55);
    expect(rec.analyzedPliesCount).toBe(1);
    expect(rec.analysisStatus).toBe('completed');
    expect(loadKifuRecords()).toHaveLength(1);
  });

  it('is idempotent: second run migrates nothing', () => {
    seedLegacyStudioGames([createStudioGame('sg-1')]);
    seedLegacyIngestedGames([createIngestedInput('ig-1')]);

    const first = migrateLegacyKifuData();
    expect(first.migrated).toBe(2);

    const second = migrateLegacyKifuData();
    expect(second.migrated).toBe(0);
    expect(second.skipped).toBe(2);
    expect(loadKifuRecords()).toHaveLength(2);
  });

  it('skips records whose id already exists in KifuRecord storage', () => {
    // Pre-seed a KifuRecord that shares the legacy id
    saveKifuRecord({
      id: 'sg-1',
      title: 'Existing',
      contentHash: 'x',
      source: 'import',
      senteName: 'A',
      goteName: 'B',
      openingId: 'unclassified',
      openingName: '未分類',
      totalPlies: 0,
      jkfJson: '{}',
      tags: [],
      isIncludedInTree: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    seedLegacyStudioGames([createStudioGame('sg-1')]);
    const result = migrateLegacyKifuData();
    expect(result.migrated).toBe(0);
    expect(result.skipped).toBe(1);
    expect(loadKifuRecords()).toHaveLength(1);
    expect(loadKifuRecords()[0]!.title).toBe('Existing');
  });
});
