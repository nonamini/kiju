import { describe, expect, it } from 'vitest';
import {
  buildEvalChartPointsFromMoves,
  buildEvalChartPointsFromPath,
  clampEvalForChart,
  formatEvalScore,
  getEvalAdvantageKey,
  EVAL_SCORE_LIMIT,
} from '../src/utils/evalChartHelper';
import { ShogiMove } from '../src/types/shogi';
import { KifuTreeNode } from '../src/types/tree';

describe('evalChartHelper unit tests', () => {
  describe('clampEvalForChart', () => {
    it('clamps values correctly within bounds', () => {
      expect(clampEvalForChart(150)).toBe(150);
      expect(clampEvalForChart(2500)).toBe(EVAL_SCORE_LIMIT);
      expect(clampEvalForChart(-30000)).toBe(-EVAL_SCORE_LIMIT);
      expect(clampEvalForChart(-200)).toBe(-200);
    });
  });

  describe('formatEvalScore', () => {
    it('formats normal centipawn scores with sign', () => {
      expect(formatEvalScore(0)).toBe('0');
      expect(formatEvalScore(150)).toBe('+150');
      expect(formatEvalScore(-240)).toBe('-240');
    });

    it('formats null or undefined as dash', () => {
      expect(formatEvalScore(null)).toBe('-');
      expect(formatEvalScore(undefined)).toBe('-');
    });

    it('formats mate scores with mate ply', () => {
      expect(formatEvalScore(30000, true, 5)).toBe('+詰み (5手・先手勝)');
      expect(formatEvalScore(-30000, true, 11)).toBe('-詰み (11手・後手勝)');
      expect(formatEvalScore(30000, true)).toBe('+詰み (先手勝)');
    });
  });

  describe('getEvalAdvantageKey', () => {
    it('returns appropriate translation keys according to score thresholds', () => {
      expect(getEvalAdvantageKey(null)).toBe('eval.no_eval_data');
      expect(getEvalAdvantageKey(30000, true)).toBe('eval.sente_mate');
      expect(getEvalAdvantageKey(-30000, true)).toBe('eval.gote_mate');
      expect(getEvalAdvantageKey(950)).toBe('eval.sente_advantage');
      expect(getEvalAdvantageKey(250)).toBe('eval.sente_slight');
      expect(getEvalAdvantageKey(50)).toBe('eval.even');
      expect(getEvalAdvantageKey(-150)).toBe('eval.even');
      expect(getEvalAdvantageKey(-350)).toBe('eval.gote_slight');
      expect(getEvalAdvantageKey(-900)).toBe('eval.gote_advantage');
    });
  });

  describe('buildEvalChartPointsFromMoves', () => {
    it('builds ply 0 starting point and maps subsequent moves', () => {
      const moves: ShogiMove[] = [
        {
          ply: 1,
          color: 'b',
          to: { file: 7, rank: 6 },
          piece: 'FU',
          isDrop: false,
          kifString: '・怜・豁ｩ(77)',
          sfenMove: '7g7f',
          evaluation: {
            scoreCp: 55,
            depth: 20,
            evaluatedAt: '2026-01-01T00:00:00Z',
          },
        },
        {
          ply: 2,
          color: 'w',
          to: { file: 8, rank: 4 },
          piece: 'FU',
          isDrop: false,
          kifString: '・伜屁豁ｩ(83)',
          sfenMove: '8c8d',
        },
        {
          ply: 3,
          color: 'b',
          to: { file: 2, rank: 6 },
          piece: 'FU',
          isDrop: false,
          kifString: '・貞・豁ｩ(27)',
          sfenMove: '2g2f',
          evaluation: {
            scoreCp: 30000,
            isMate: true,
            matePly: 15,
            depth: 25,
            evaluatedAt: '2026-01-01T00:00:00Z',
          },
        },
      ];

      const points = buildEvalChartPointsFromMoves(moves);
      expect(points).toHaveLength(4);
      expect(points[0]).toEqual({
        ply: 0,
        scoreCp: 0,
        rawScoreCp: 0,
        moveText: 'Start',
      });
      expect(points[1]?.ply).toBe(1);
      expect(points[1]?.scoreCp).toBe(55);
      expect(points[2]?.ply).toBe(2);
      expect(points[2]?.scoreCp).toBeNull();
      expect(points[3]?.ply).toBe(3);
      expect(points[3]?.scoreCp).toBe(EVAL_SCORE_LIMIT);
      expect(points[3]?.isMate).toBe(true);
      expect(points[3]?.matePly).toBe(15);
    });
  });

  describe('buildEvalChartPointsFromPath', () => {
    it('extracts evaluations from KifuTreeNode path', () => {
      const path: KifuTreeNode[] = [
        {
          id: 'node-1',
          sfen: 'sfen-1',
          move: {
            ply: 1,
            color: 'b',
            to: { file: 7, rank: 6 },
            piece: 'FU',
            isDrop: false,
            kifString: '・怜・豁ｩ(77)',
            sfenMove: '7g7f',
          },
          comment: '',
          evaluation: {
            scoreCp: -120,
            depth: 18,
            evaluatedAt: '2026-01-01T00:00:00Z',
          },
          gameCount: 1,
          wins: { sente: 1, gote: 0, draw: 0 },
          gameRefs: [],
          children: [],
          isMainline: true,
        },
      ];

      const points = buildEvalChartPointsFromPath(path);
      expect(points).toHaveLength(2);
      expect(points[0]?.ply).toBe(0);
      expect(points[1]?.ply).toBe(1);
      expect(points[1]?.scoreCp).toBe(-120);
      expect(points[1]?.depth).toBe(18);
    });
  });
});
