import { describe, expect, it } from 'vitest';
import type { KifuRecord } from '../types/kifuRecord';
import type { ShogiMove, MoveEvaluation } from '../types/shogi';
import type { IngestedGame } from '../types/tree';
import type { SavedStudioGame } from './studioKifuStorage';
import type { GameMergeInput } from './treeMerger';
import {
  applyRecordEvaluationsToMoves,
  countForkPointsInJkfJson,
  firestoreDocToKifuRecord,
  ingestedInputToKifuRecord,
  kifuRecordToFirestoreDoc,
  kifuRecordToIngestedGame,
  kifuRecordToStudioGame,
  movesEvaluationToRecordMap,
  rawKifToJkfJson,
  studioGameToKifuRecord,
} from './kifuRecordCodec';

const VALID_KIF = `手合割：平手
先手：テスト一
後手：テスト二
手数----指手---------消費時間--
1 ７六歩(77)
2 ３四歩(33)
3 ２六歩(27)
4 ８四歩(83)
`;

const EVAL: MoveEvaluation = {
  scoreCp: 120,
  depth: 14,
  evaluatedAt: '2026-01-01T00:00:00.000Z',
};

function makeRecord(overrides: Partial<KifuRecord> = {}): KifuRecord {
  return {
    id: 'rec-1',
    title: 'Test Game',
    contentHash: 'abc123',
    source: 'studio',
    senteName: '先手太郎',
    goteName: '後手花子',
    openingId: 'aigakari',
    openingName: '相掛かり',
    totalPlies: 4,
    jkfJson: '{}',
    rawKif: VALID_KIF,
    tags: ['研究'],
    notes: 'memo',
    favorite: true,
    reviewStatus: 'read',
    isIncludedInTree: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function makeStudioGame(overrides: Partial<SavedStudioGame> = {}): SavedStudioGame {
  return {
    id: 'sg-1',
    title: 'Studio Game',
    senteName: 'A',
    goteName: 'B',
    openingId: 'yagura',
    openingName: '矢倉',
    totalPlies: 4,
    forkCount: 2,
    jkfJson: '{}',
    rawKif: VALID_KIF,
    tags: ['タグ'],
    evaluations: { 1: EVAL },
    analysisStatus: 'completed',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeMove(ply: number, withEval = false): ShogiMove {
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

describe('rawKifToJkfJson / countForkPointsInJkfJson', () => {
  it('parses valid KIF into JKF JSON and returns {} for invalid input', () => {
    const jkf = rawKifToJkfJson(VALID_KIF);
    expect(jkf).not.toBe('{}');
    const parsed = JSON.parse(jkf) as { moves?: unknown[] };
    expect(Array.isArray(parsed.moves)).toBe(true);
    expect(rawKifToJkfJson('not a kifu')).toBe('{}');
    expect(rawKifToJkfJson(undefined)).toBe('{}');
  });

  it('counts fork points recursively', () => {
    const jkfWithFork = JSON.stringify({
      header: {},
      moves: [
        { move: { color: 0 } },
        { move: { color: 1 }, forks: [[{ move: { color: 0 } }], [{ move: { color: 0 } }]] },
      ],
    });
    expect(countForkPointsInJkfJson(jkfWithFork)).toBe(1);
    expect(countForkPointsInJkfJson('{}')).toBe(0);
    expect(countForkPointsInJkfJson('invalid')).toBe(0);
  });
});

describe('evaluation rehydration helpers', () => {
  it('movesEvaluationToRecordMap extracts per-ply evaluations', () => {
    const moves = [makeMove(1, true), makeMove(2), makeMove(3, true)];
    const map = movesEvaluationToRecordMap(moves);
    expect(map?.[1]).toEqual(EVAL);
    expect(map?.[3]).toEqual(EVAL);
    expect(map?.[2]).toBeUndefined();
    expect(movesEvaluationToRecordMap([makeMove(1)])).toBeUndefined();
  });

  it('applyRecordEvaluationsToMoves injects evaluations by ply', () => {
    const moves = [makeMove(1), makeMove(2), makeMove(3)];
    const result = applyRecordEvaluationsToMoves(moves, { 2: EVAL });
    expect(result[0]!.evaluation).toBeUndefined();
    expect(result[1]!.evaluation).toEqual(EVAL);
    expect(result[2]!.evaluation).toBeUndefined();
    // original array untouched (immutable)
    expect(moves[1]!.evaluation).toBeUndefined();
    expect(applyRecordEvaluationsToMoves(moves, undefined)).toBe(moves);
  });
});

describe('studio view conversions', () => {
  it('kifuRecordToStudioGame projects all shared fields', () => {
    const rec = makeRecord({ evaluations: { 1: EVAL }, analysisStatus: 'completed' });
    const view = kifuRecordToStudioGame(rec);
    expect(view.id).toBe('rec-1');
    expect(view.senteName).toBe('先手太郎');
    expect(view.tags).toEqual(['研究']);
    expect(view.evaluations?.[1]).toEqual(EVAL);
    expect(view.analysisStatus).toBe('completed');
    expect(view.forkCount).toBe(0); // '{}' jkfJson has no forks
  });

  it('maps extended analysis statuses down to the 3-state studio view', () => {
    expect(kifuRecordToStudioGame(makeRecord({ analysisStatus: 'queued' })).analysisStatus).toBe('analyzing');
    expect(kifuRecordToStudioGame(makeRecord({ analysisStatus: 'processing' })).analysisStatus).toBe('analyzing');
    expect(kifuRecordToStudioGame(makeRecord({ analysisStatus: 'failed' })).analysisStatus).toBe('unanalyzed');
  });

  it('studioGameToKifuRecord preserves KifuRecord-only fields from base', () => {
    const base = makeRecord({ notes: 'keep-me', isIncludedInTree: true });
    const view = makeStudioGame();
    const rec = studioGameToKifuRecord(view, base);
    expect(rec.id).toBe('sg-1');
    expect(rec.source).toBe('studio');
    expect(rec.notes).toBe('keep-me');
    expect(rec.isIncludedInTree).toBe(true);
    expect(rec.originStudioGameId).toBe('sg-1');
    expect(rec.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rec.analysisStatus).toBe('completed');
  });

  it('studioGameToKifuRecord without base still produces valid record', () => {
    const rec = studioGameToKifuRecord(makeStudioGame({ analysisStatus: 'analyzing' }));
    expect(rec.analysisStatus).toBe('analyzing');
    expect(rec.tags).toEqual(['タグ']);
    expect(rec.createdAt).toBeTruthy();
  });

  it('studioGameToKifuRecord preserves cloud queued/processing status from base', () => {
    const queuedRec = studioGameToKifuRecord(
      makeStudioGame({ analysisStatus: 'analyzing' }),
      makeRecord({ analysisStatus: 'queued' })
    );
    expect(queuedRec.analysisStatus).toBe('queued');

    const processingRec = studioGameToKifuRecord(
      makeStudioGame({ analysisStatus: 'analyzing' }),
      makeRecord({ analysisStatus: 'processing' })
    );
    expect(processingRec.analysisStatus).toBe('processing');
  });
});

describe('tree view conversions', () => {
  function makeIngestedGame(overrides: Partial<IngestedGame> = {}): IngestedGame {
    return {
      id: 'ig-1',
      userId: 'user-main',
      openingId: 'kakugawari',
      title: 'Ingested',
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
  }

  function makeInput(overrides: { game?: Partial<IngestedGame>; moves?: ShogiMove[] } = {}): GameMergeInput {
    return {
      game: makeIngestedGame(overrides.game),
      moves: overrides.moves ?? [makeMove(1, true), makeMove(2)],
      variations: [],
    };
  }

  it('kifuRecordToIngestedGame maps winner and flags', () => {
    const rec = makeRecord({ winner: 'sente', isIncludedInTree: true, analysisStatus: 'completed' });
    const view = kifuRecordToIngestedGame(rec);
    expect(view.winner).toBe('b');
    expect(view.isIncluded).toBe(true);
    expect(view.isAnalyzed).toBe(true);
    expect(view.plyCount).toBe(4);
    expect(view.userId).toBe('user-main');
  });

  it('kifuRecordToIngestedGame marks analyzed when evaluations exist even without completed status', () => {
    const view = kifuRecordToIngestedGame(makeRecord({ evaluations: { 1: EVAL }, analysisStatus: 'unanalyzed' }));
    expect(view.isAnalyzed).toBe(true);
  });

  it('ingestedInputToKifuRecord harvests move evaluations into record map', () => {
    const rec = ingestedInputToKifuRecord(makeInput());
    expect(rec.source).toBe('tree');
    expect(rec.winner).toBe('sente');
    expect(rec.isIncludedInTree).toBe(true);
    expect(rec.analysisStatus).toBe('completed');
    expect(rec.evaluations?.[1]).toEqual(EVAL);
    expect(rec.analyzedPliesCount).toBe(1);
    expect(rec.jkfJson).not.toBe('{}');
    expect(rec.originIngestedGameId).toBe('ig-1');
  });

  it('ingestedInputToKifuRecord preserves base fields on update', () => {
    const base = makeRecord({ notes: 'tree-note', favorite: true, tags: ['既存'] });
    const rec = ingestedInputToKifuRecord(makeInput(), base, '角換わり');
    expect(rec.notes).toBe('tree-note');
    expect(rec.favorite).toBe(true);
    expect(rec.tags).toEqual(['既存']);
    expect(rec.openingName).toBe('角換わり');
  });

  it('ingestedInputToKifuRecord marks unanalyzed when no evals and flag false', () => {
    const rec = ingestedInputToKifuRecord(
      makeInput({ game: { isAnalyzed: false }, moves: [makeMove(1), makeMove(2)] })
    );
    expect(rec.analysisStatus).toBe('unanalyzed');
    expect(rec.evaluations).toBeUndefined();
  });
});

describe('firestore document normalization (#42e)', () => {
  it('kifuRecordToFirestoreDoc adds schema marker and strips undefined', () => {
    const rec = makeRecord({ notes: undefined, favorite: undefined });
    const doc = kifuRecordToFirestoreDoc(rec);
    expect(doc.recordSchema).toBe(1);
    expect(doc.id).toBe('rec-1');
    expect(doc.source).toBe('studio');
    expect('notes' in doc).toBe(false);
    expect('favorite' in doc).toBe(false);
  });

  it('firestoreDocToKifuRecord round-trips a new-schema doc', () => {
    const rec = makeRecord({ evaluations: { 1: EVAL }, analysisStatus: 'completed' });
    const doc = kifuRecordToFirestoreDoc(rec);
    const decoded = firestoreDocToKifuRecord(doc, 'rec-1');
    expect(decoded).not.toBeNull();
    expect(decoded!.wasLegacy).toBe(false);
    expect(decoded!.record.id).toBe('rec-1');
    expect(decoded!.record.evaluations?.[1]).toEqual(EVAL);
    expect(decoded!.record.source).toBe('studio');
  });

  it('firestoreDocToKifuRecord decodes a record-shaped doc without marker', () => {
    const rec = makeRecord({ source: 'tree', isIncludedInTree: true });
    const { recordSchema: _drop, ...doc } = kifuRecordToFirestoreDoc(rec) as Record<string, unknown>;
    const decoded = firestoreDocToKifuRecord(doc, 'x');
    expect(decoded!.wasLegacy).toBe(false);
    expect(decoded!.record.source).toBe('tree');
    expect(decoded!.record.isIncludedInTree).toBe(true);
  });

  it('firestoreDocToKifuRecord converts a legacy SavedStudioGame doc', () => {
    const legacy = {
      id: 'old-1',
      title: 'Legacy Game',
      senteName: 'S',
      goteName: 'G',
      openingId: 'yagura',
      openingName: '矢倉',
      totalPlies: 4,
      forkCount: 2,
      jkfJson: '{}',
      rawKif: VALID_KIF,
      tags: ['旧'],
      evaluations: { 1: EVAL },
      analysisStatus: 'completed',
      winner: 'gote',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-02T00:00:00.000Z',
    };
    const decoded = firestoreDocToKifuRecord(legacy, 'old-1');
    expect(decoded).not.toBeNull();
    expect(decoded!.wasLegacy).toBe(true);
    const rec = decoded!.record;
    expect(rec.id).toBe('old-1');
    expect(rec.source).toBe('studio');
    expect(rec.originStudioGameId).toBe('old-1');
    expect(rec.evaluations?.[1]).toEqual(EVAL);
    expect(rec.analysisStatus).toBe('completed');
    expect(rec.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('firestoreDocToKifuRecord returns null for garbage docs', () => {
    expect(firestoreDocToKifuRecord(null, 'x')).toBeNull();
    expect(firestoreDocToKifuRecord('string', 'x')).toBeNull();
    expect(firestoreDocToKifuRecord({ foo: 'bar' }, 'x')).toBeNull();
    expect(firestoreDocToKifuRecord({ id: 'x' }, 'x')).toBeNull();
  });

  it('firestoreDocToKifuRecord uses docId when record lacks id', () => {
    const doc = kifuRecordToFirestoreDoc(makeRecord());
    delete doc.id;
    const decoded = firestoreDocToKifuRecord(doc, 'doc-id-9');
    expect(decoded!.record.id).toBe('doc-id-9');
  });
});
