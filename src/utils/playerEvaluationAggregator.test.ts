import { describe, expect, it } from 'vitest';
import type { KifuRecord } from '../types/kifuRecord';
import type { MoveEvaluation } from '../types/shogi';
import {
  aggregatePlayerEvaluation,
  computeKifuEvaluationSummary,
} from './playerEvaluationAggregator';

function makeRecord(overrides: Partial<KifuRecord> = {}): KifuRecord {
  return {
    id: 'rec-1',
    title: 'Test Game',
    contentHash: 'hash-1',
    source: 'import',
    senteName: 'Player A',
    goteName: 'Player B',
    sentePlayerId: 'player-a',
    gotePlayerId: 'player-b',
    openingId: 'kakugawari',
    openingName: '角換わり',
    winner: 'sente',
    totalPlies: 40,
    jkfJson: '{}',
    tags: [],
    isIncludedInTree: true,
    createdAt: '2026-11-16T00:00:00.000Z',
    updatedAt: '2026-11-16T00:00:00.000Z',
    ...overrides,
  };
}

function makeEvaluations(plies: number, scoreFn: (ply: number) => number): Record<number, MoveEvaluation> {
  const map: Record<number, MoveEvaluation> = {};
  for (let p = 0; p <= plies; p++) {
    map[p] = {
      scoreCp: scoreFn(p),
      depth: 12,
      bestMove: '7g7f',
      evaluatedAt: '2026-11-16T00:00:00.000Z',
    };
  }
  return map;
}

describe('playerEvaluationAggregator (#58b)', () => {
  it('computes KifuEvaluationSummary from raw evaluations map', () => {
    const evaluations = makeEvaluations(40, (p) => (p <= 30 ? 0 : p * 10));
    const rec = makeRecord({ evaluations, totalPlies: 40, winner: 'sente' });

    const summary = computeKifuEvaluationSummary(rec);
    expect(summary).toBeDefined();
    expect(summary?.black.isWinner).toBe(true);
    expect(summary?.white.isWinner).toBe(false);
    expect(summary?.black.radarChart.opening).toBeGreaterThanOrEqual(80);
  });

  it('returns undefined when evaluations are missing or fewer than 4 plies', () => {
    expect(computeKifuEvaluationSummary(makeRecord())).toBeUndefined();
    const tiny = makeRecord({ evaluations: makeEvaluations(2, () => 0), totalPlies: 2 });
    expect(computeKifuEvaluationSummary(tiny)).toBeUndefined();
  });

  it('returns null when a player has 0 analyzed games', () => {
    const unanalyzed = makeRecord({ id: 'u1' });
    expect(aggregatePlayerEvaluation('player-a', [unanalyzed])).toBeNull();
  });

  it('aggregates across Sente and Gote games from that player perspective', () => {
    const recAsSente = makeRecord({
      id: 'g1',
      sentePlayerId: 'player-a',
      gotePlayerId: 'player-b',
      evaluationSummary: {
        overallLevel: 'LV_5B',
        black: {
          level: 'LV_5A',
          isWinner: true,
          meanWinRateLoss: 1.5,
          acl: 12,
          criticalAccuracy: 90,
          blunderCount: 0,
          mistakeCount: 0,
          inaccuracyCount: 1,
          radarChart: {
            opening: 90,
            midgame: 88,
            endgame: 92,
            stability: 96,
            tactics: 86,
          },
          pattern: 'WIRE_TO_WIRE',
        },
        white: {
          level: 'LV_4',
          isWinner: false,
          meanWinRateLoss: 5.5,
          acl: 45,
          criticalAccuracy: 70,
          blunderCount: 1,
          mistakeCount: 1,
          inaccuracyCount: 2,
          radarChart: {
            opening: 80,
            midgame: 70,
            endgame: 50,
            stability: 60,
            tactics: 65,
          },
          pattern: 'WIRE_TO_WIRE',
        },
      },
    });

    const recAsGote = makeRecord({
      id: 'g2',
      sentePlayerId: 'player-b',
      gotePlayerId: 'player-a',
      winner: 'gote',
      evaluationSummary: {
        overallLevel: 'LV_5C',
        black: {
          level: 'LV_3',
          isWinner: false,
          meanWinRateLoss: 7.0,
          acl: 60,
          criticalAccuracy: 60,
          blunderCount: 2,
          mistakeCount: 2,
          inaccuracyCount: 2,
          radarChart: {
            opening: 70,
            midgame: 65,
            endgame: 40,
            stability: 45,
            tactics: 55,
          },
          pattern: 'COMEBACK',
        },
        white: {
          level: 'LV_5B',
          isWinner: true,
          meanWinRateLoss: 2.5,
          acl: 20,
          criticalAccuracy: 80,
          blunderCount: 0,
          mistakeCount: 2,
          inaccuracyCount: 1,
          radarChart: {
            opening: 80,
            midgame: 84,
            endgame: 88,
            stability: 84,
            tactics: 82,
          },
          pattern: 'WIRE_TO_WIRE',
        },
      },
    });

    const recUnanalyzed = makeRecord({ id: 'g3', sentePlayerId: 'player-a' });

    const agg = aggregatePlayerEvaluation('player-a', [
      recAsSente,
      recAsGote,
      recUnanalyzed,
    ]);

    expect(agg).not.toBeNull();
    expect(agg?.analyzedGamesCount).toBe(2);
    expect(agg?.totalGamesCount).toBe(3);
    expect(agg?.avgMeanWinRateLoss).toBe(2.0);
    expect(agg?.avgCriticalAccuracy).toBe(85);
    expect(agg?.avgBlundersPerGame).toBe(0);
    expect(agg?.radarChart).toEqual({
      opening: 85,
      midgame: 86,
      endgame: 90,
      stability: 90,
      tactics: 84,
    });
    expect(agg?.dominantPattern).toBe('WIRE_TO_WIRE');
    expect(agg?.strongestAxis).toBe('endgame');
    expect(agg?.overallComment).toContain('分析対象2局');
  });
});
