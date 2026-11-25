import { beforeEach, describe, expect, it } from 'vitest';
import { getSafeStorage } from './matchHistoryStorage';
import { KIFU_RECORDS_STORAGE_KEY, loadKifuRecords, saveKifuRecord } from './kifuRecordStorage';
import {
  deleteStudioGame,
  loadLegacyStudioGamesRaw,
  loadSavedStudioGames,
  saveStudioGame,
  STUDIO_GAMES_LEGACY_KEY,
  STUDIO_GAMES_STORAGE_KEY,
  updateStudioGameEvaluations,
  SavedStudioGame,
} from './studioKifuStorage';
import { KifuRecord } from '../types/kifuRecord';
import { MoveEvaluation } from '../types/shogi';

const EVAL: MoveEvaluation = { scoreCp: 40, depth: 10, evaluatedAt: '2026-01-01T00:00:00Z' };

function createGame(id: string, overrides: Partial<SavedStudioGame> = {}): SavedStudioGame {
  return {
    id,
    title: `Game ${id}`,
    senteName: 'A',
    goteName: 'B',
    openingId: 'aigakari',
    openingName: '相掛かり',
    totalPlies: 4,
    forkCount: 0,
    jkfJson: '{}',
    rawKif: '手合割：平手\n先手：A\n後手：B\n',
    tags: ['研究'],
    evaluations: { 1: EVAL },
    analysisStatus: 'completed',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeRecord(overrides: Partial<KifuRecord> = {}): KifuRecord {
  return {
    id: 'rec-x',
    title: 'X',
    contentHash: 'h',
    source: 'import',
    senteName: 'A',
    goteName: 'B',
    openingId: 'other',
    openingName: 'Other',
    totalPlies: 0,
    jkfJson: '{}',
    tags: [],
    notes: 'keep',
    isIncludedInTree: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('studioKifuStorage (KifuRecord backend)', () => {
  beforeEach(() => {
    const storage = getSafeStorage();
    storage.removeItem(KIFU_RECORDS_STORAGE_KEY);
    storage.removeItem(STUDIO_GAMES_STORAGE_KEY);
    storage.removeItem(STUDIO_GAMES_LEGACY_KEY);
  });

  it('saveStudioGame persists a studio-source KifuRecord, not the legacy key', () => {
    saveStudioGame(createGame('sg-1'));

    expect(getSafeStorage().getItem(STUDIO_GAMES_STORAGE_KEY)).toBeNull();
    const records = loadKifuRecords();
    expect(records).toHaveLength(1);
    expect(records[0]!.source).toBe('studio');
    expect(records[0]!.id).toBe('sg-1');
    expect(records[0]!.originStudioGameId).toBe('sg-1');
    expect(records[0]!.evaluations?.[1]).toEqual(EVAL);
  });

  it('loadSavedStudioGames returns the SavedStudioGame view sorted newest-first', () => {
    saveStudioGame(createGame('sg-old', { createdAt: '2025-01-01T00:00:00.000Z' }));
    saveStudioGame(createGame('sg-new', { createdAt: '2026-06-01T00:00:00.000Z' }));

    const games = loadSavedStudioGames();
    expect(games.map((g) => g.id)).toEqual(['sg-new', 'sg-old']);
    expect(games[0]!.title).toBe('Game sg-new');
    expect(games[0]!.evaluations?.[1]).toEqual(EVAL);
    expect(games[0]!.analysisStatus).toBe('completed');
  });

  it('saveStudioGame updates existing record and preserves KifuRecord-only fields', () => {
    saveKifuRecord(makeRecord({ id: 'sg-1', source: 'studio', notes: 'memo', favorite: true }));
    saveStudioGame(createGame('sg-1', { title: 'Updated' }));

    const rec = loadKifuRecords().find((r) => r.id === 'sg-1')!;
    expect(rec.title).toBe('Updated');
    expect(rec.notes).toBe('memo');
    expect(rec.favorite).toBe(true);
  });

  it('updateStudioGameEvaluations merges evaluations through the record', () => {
    saveStudioGame(createGame('sg-1'));
    const eval2: MoveEvaluation = { scoreCp: 90, depth: 14, evaluatedAt: '2026-01-02T00:00:00Z' };
    updateStudioGameEvaluations('sg-1', { 2: eval2 }, { engineId: 'engine-x', depth: 14 });

    const view = loadSavedStudioGames()[0]!;
    expect(view.evaluations?.[1]).toEqual(EVAL);
    expect(view.evaluations?.[2]).toEqual(eval2);
    expect(view.analyzedPliesCount).toBe(2);
    expect(view.analysisEngineId).toBe('engine-x');

    const rec = loadKifuRecords()[0]!;
    expect(rec.evaluations?.[2]).toEqual(eval2);
    expect(rec.analysisEngineId).toBe('engine-x');
  });

  it('deleteStudioGame removes only the studio record', () => {
    saveStudioGame(createGame('sg-1'));
    saveKifuRecord(makeRecord({ id: 'imp-1', source: 'import' }));
    deleteStudioGame('sg-1');

    const records = loadKifuRecords();
    expect(records).toHaveLength(1);
    expect(records[0]!.id).toBe('imp-1');
  });

  it('non-studio records survive studio saves', () => {
    saveKifuRecord(makeRecord({ id: 'tree-1', source: 'tree' }));
    saveStudioGame(createGame('sg-1'));
    expect(loadKifuRecords().map((r) => r.id).sort()).toEqual(['sg-1', 'tree-1']);
  });

  it('loadLegacyStudioGamesRaw reads legacy keys with primary winning', () => {
    getSafeStorage().setItem(
      STUDIO_GAMES_LEGACY_KEY,
      JSON.stringify([createGame('dup', { title: 'legacy' })])
    );
    getSafeStorage().setItem(
      STUDIO_GAMES_STORAGE_KEY,
      JSON.stringify([createGame('dup', { title: 'primary' })])
    );
    const raw = loadLegacyStudioGamesRaw();
    expect(raw).toHaveLength(1);
    expect(raw[0]!.title).toBe('primary');
  });
});
