import { beforeEach, describe, expect, it } from 'vitest';
import { KifuRecord } from '../types/kifuRecord';
import { MergedKifuTree } from '../types/tree';
import {
  getKifuRecord,
  KIFU_RECORDS_STORAGE_KEY,
  saveKifuRecords,
} from './kifuRecordStorage';
import { getSafeStorage } from './matchHistoryStorage';
import { syncTreeEvaluationsToRecords } from './treeEvalSync';

function makeRecord(id: string, overrides: Partial<KifuRecord> = {}): KifuRecord {
  return {
    id,
    title: `Game ${id}`,
    contentHash: `hash-${id}`,
    source: 'tree',
    senteName: '先手',
    goteName: '後手',
    openingId: 'kakugawari',
    openingName: '角換わり',
    totalPlies: 2,
    jkfJson: '{}',
    tags: [],
    isIncludedInTree: true,
    createdAt: '2026-11-15T00:00:00.000Z',
    updatedAt: '2026-11-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('syncTreeEvaluationsToRecords', () => {
  beforeEach(() => {
    getSafeStorage().removeItem(KIFU_RECORDS_STORAGE_KEY);
  });

  it('writes node evaluations back to referenced KifuRecords and marks completed', () => {
    saveKifuRecords([
      makeRecord('g1', { analysisStatus: 'unanalyzed' }),
      makeRecord('g2', { analysisStatus: 'queued' }),
    ]);

    const tree: MergedKifuTree = {
      openingId: 'kakugawari',
      openingName: '角換わり',
      rootSfen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
      totalGames: 2,
      updatedAt: '2026-11-15T00:00:00.000Z',
      rootNodes: [
        {
          id: 'n1',
          sfen: 'sfen-1',
          move: {
            ply: 1,
            color: 'b',
            from: { file: 7, rank: 7 },
            to: { file: 7, rank: 6 },
            piece: 'FU',
            isDrop: false,
            kifString: '▲７六歩',
            sfenMove: '7g7f',
          },
          comment: '',
          gameCount: 2,
          wins: { sente: 1, gote: 1, draw: 0 },
          gameRefs: [
            { gameId: 'g1', title: 'G1', date: '2026-11-15', winner: 'b' },
            { gameId: 'g2', title: 'G2', date: '2026-11-15', winner: 'w' },
          ],
          evaluation: {
            scoreCp: 120,
            depth: 12,
            bestMove: '7g7f',
            pv: ['7g7f', '3c3d'],
            evaluatedAt: '2026-11-15T00:00:00.000Z',
          },
          children: [],
          isMainline: true,
        },
      ],
    };

    const updated = syncTreeEvaluationsToRecords(tree, 'suisho5');
    expect(updated).toBe(2);

    const r1 = getKifuRecord('g1');
    expect(r1?.analysisStatus).toBe('completed');
    expect(r1?.analysisEngineId).toBe('suisho5');
    expect(r1?.evaluations?.[1]?.scoreCp).toBe(120);

    // Queued cloud status is preserved while local evaluation is still merged
    const r2 = getKifuRecord('g2');
    expect(r2?.analysisStatus).toBe('queued');
    expect(r2?.evaluations?.[1]?.scoreCp).toBe(120);
  });
});
