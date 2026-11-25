import { describe, expect, it } from 'vitest';
import type { MoveAnalysisInput } from '../types/evaluation';
import { cpToWinRate, evaluateGame } from './gameEvaluationEngine';

/**
 * Helper to generate alternating Sente/Gote moves starting from ply 1.
 */
function buildMoveSequence(
  entries: Array<{
    ply: number;
    bestScore: number;
    playedScore: number;
    playedMove?: string;
    bestMove?: string;
    secondScore?: number;
    isBookMove?: boolean;
  }>
): MoveAnalysisInput[] {
  return entries.map((e) => ({
    ply: e.ply,
    turn: e.ply % 2 === 1 ? 'b' : 'w',
    playedMove: e.playedMove ?? '7g7f',
    bestMove: e.bestMove ?? '2g2f',
    bestScore: e.bestScore,
    playedScore: e.playedScore,
    secondScore: e.secondScore,
    isBookMove: e.isBookMove,
  }));
}

describe('gameEvaluationEngine (Issue #60 v2.0 ΔWR spec)', () => {
  it('computes expected win rate via sigmoid and clamps extremes cleanly', () => {
    expect(cpToWinRate(0)).toBeCloseTo(50.0, 2);
    expect(cpToWinRate(600)).toBeCloseTo(73.1058, 2);
    expect(cpToWinRate(-600)).toBeCloseTo(26.8941, 2);
    expect(cpToWinRate(10000)).toBeCloseTo(cpToWinRate(6000), 5);
    expect(cpToWinRate(-10000)).toBeCloseTo(cpToWinRate(-6000), 5);
  });

  it('exempts winning-margin simplifications (> +2000cp -> +1700cp) as non-blunders', () => {
    const moves: MoveAnalysisInput[] = [];
    // Plies 1..30: book opening at +2400cp
    for (let p = 1; p <= 30; p++) {
      moves.push({
        ply: p,
        turn: p % 2 === 1 ? 'b' : 'w',
        playedMove: '7g7f',
        bestMove: '7g7f',
        bestScore: 2400,
        playedScore: 2400,
        isBookMove: true,
      });
    }
    // Ply 31 (Sente): safe simplification from +2400cp to +1700cp (700cp drop, but still ~94.4% WR)
    moves.push({
      ply: 31,
      turn: 'b',
      playedMove: '5i5h',
      bestMove: '2h2d',
      bestScore: 2400,
      playedScore: 1700,
      isBookMove: false,
    });
    // Ply 32 (Gote) -> Ply 36 keep playing around +1700cp -> +1800cp
    for (let p = 32; p <= 36; p++) {
      moves.push({
        ply: p,
        turn: p % 2 === 1 ? 'b' : 'w',
        playedMove: '3c3d',
        bestMove: '3c3d',
        bestScore: 1700,
        playedScore: 1700,
        isBookMove: false,
      });
    }

    const res = evaluateGame(moves, { winnerColor: 'b' });
    expect(res.black.metrics.blunderCount).toBe(0);
    expect(res.black.radarChart.endgame).toBeGreaterThanOrEqual(90);
  });

  it('detects massive throw-away blunder when dropping from > +2000cp to < +600cp', () => {
    const moves: MoveAnalysisInput[] = buildMoveSequence([
      { ply: 30, bestScore: 2400, playedScore: 2400, playedMove: '1a1b', bestMove: '1a1b', isBookMove: true },
      // Ply 31 Sente throws away +2400 -> -200 (ΔWR > 20pt and reversal <= 45% WR)
      { ply: 31, bestScore: 2400, playedScore: -200, playedMove: '9g9f', bestMove: '2h2d', isBookMove: false },
      { ply: 32, bestScore: -200, playedScore: -200, playedMove: '3c3d', bestMove: '3c3d', isBookMove: false },
      { ply: 33, bestScore: -200, playedScore: -200, playedMove: '7g7f', bestMove: '7g7f', isBookMove: false },
    ]);

    const res = evaluateGame(moves, { winnerColor: 'w' });
    expect(res.black.metrics.blunderCount).toBe(1);
    expect(res.black.metrics.reversalCount).toBe(1);
  });

  it('applies 30cp shallow-search noise floor and exact bestMove match exemption', () => {
    const moves = buildMoveSequence([
      { ply: 30, bestScore: 100, playedScore: 100, playedMove: '3c3d', bestMove: '3c3d', isBookMove: true },
      // 30cp drop -> treated as 0 ΔWR
      { ply: 31, bestScore: 100, playedScore: 70, playedMove: '7g7f', bestMove: '2g2f', isBookMove: false },
      // Exact bestMove match even with search fluctuation -> treated as 0 ΔWR
      { ply: 32, bestScore: 70, playedScore: 120, playedMove: '8c8d', bestMove: '8c8d', isBookMove: false },
      { ply: 33, bestScore: 120, playedScore: 120, playedMove: '2g2f', bestMove: '2g2f', isBookMove: false },
      { ply: 34, bestScore: 120, playedScore: 120, playedMove: '4a3b', bestMove: '4a3b', isBookMove: false },
    ]);

    const res = evaluateGame(moves);
    expect(res.black.metrics.meanWinRateLoss).toBe(0);
    expect(res.white.metrics.meanWinRateLoss).toBe(0);
    expect(res.black.metrics.blunderCount).toBe(0);
    expect(res.black.metrics.mistakeCount).toBe(0);
  });

  it('normalizes blunder penalty per 30 effective moves so long games are not over-penalized', () => {
    const buildGame = (effectivePliesPerSide: number): MoveAnalysisInput[] => {
      const list: MoveAnalysisInput[] = [
        {
          ply: 30,
          turn: 'w',
          playedMove: '3c3d',
          bestMove: '3c3d',
          bestScore: 0,
          playedScore: 0,
          isBookMove: true,
        },
      ];
      let ply = 31;
      for (let i = 0; i < effectivePliesPerSide; i++) {
        // Sente makes 1 blunder at index 0, otherwise plays accurately at ~0cp
        const isFirst = i === 0;
        list.push({
          ply: ply++,
          turn: 'b',
          playedMove: isFirst ? '9g9f' : '7g7f',
          bestMove: '7g7f',
          bestScore: isFirst ? 0 : -600,
          playedScore: isFirst ? -600 : -600,
          isBookMove: false,
        });
        list.push({
          ply: ply++,
          turn: 'w',
          playedMove: '8c8d',
          bestMove: '8c8d',
          bestScore: -600,
          playedScore: -600,
          isBookMove: false,
        });
      }
      return list;
    };

    const shortGame = evaluateGame(buildGame(20)); // 20 effective moves, 1 blunder -> normBlunders = 1.5
    const longGame = evaluateGame(buildGame(60)); // 60 effective moves, 1 blunder -> normBlunders = 0.5

    expect(longGame.black.radarChart.stability).toBeGreaterThan(
      shortGame.black.radarChart.stability
    );
  });

  it('applies Bayesian smoothing to opening score and detects critical moments without secondScore', () => {
    const moves: MoveAnalysisInput[] = [];
    // Only 2 moves in opening; ply 1 has a sharp drop so naive mean would tank, Bayesian(+5) prevents 0-score collapse
    moves.push({
      ply: 1,
      turn: 'b',
      playedMove: '9g9f',
      bestMove: '7g7f',
      bestScore: 0,
      playedScore: -250,
    });
    moves.push({
      ply: 2,
      turn: 'w',
      playedMove: '3c3d',
      bestMove: '3c3d',
      bestScore: -250,
      playedScore: -250,
    });
    // Add critical midgame moves in 25..75% WR band (no secondScore provided)
    for (let p = 31; p <= 40; p++) {
      moves.push({
        ply: p,
        turn: p % 2 === 1 ? 'b' : 'w',
        playedMove: p % 2 === 1 ? '7g7f' : '3c3d',
        bestMove: p % 2 === 1 ? '7g7f' : '3c3d',
        bestScore: 0,
        playedScore: 0,
        isBookMove: false,
      });
    }

    const res = evaluateGame(moves, { winnerColor: 'b' });
    expect(res.black.radarChart.opening).toBeGreaterThanOrEqual(75);
    expect(res.black.metrics.criticalAccuracy).toBe(100);
    expect(res.black.radarChart.tactics).toBeGreaterThanOrEqual(85);
  });

  it('weights overallLevel toward winner (0.6 winner + 0.4 loser) rather than taking min', () => {
    const moves: MoveAnalysisInput[] = [];
    // Plies 1..30 book at 0cp
    for (let p = 1; p <= 30; p++) {
      moves.push({
        ply: p,
        turn: p % 2 === 1 ? 'b' : 'w',
        playedMove: '7g7f',
        bestMove: '7g7f',
        bestScore: 0,
        playedScore: 0,
        isBookMove: true,
      });
    }
    // Sente plays flawlessly while Gote loses ~450cp repeatedly over plies 31..40 (Mean ΔWR >= 9.0pt)
    let currentScore = 0;
    for (let p = 31; p <= 40; p++) {
      const turn = p % 2 === 1 ? 'b' : 'w';
      if (turn === 'b') {
        moves.push({
          ply: p,
          turn: 'b',
          playedMove: '2h2d',
          bestMove: '2h2d',
          bestScore: currentScore,
          playedScore: currentScore,
          isBookMove: false,
        });
      } else {
        const nextScore = currentScore + 450;
        moves.push({
          ply: p,
          turn: 'w',
          playedMove: '1a1b',
          bestMove: '8c8d',
          bestScore: currentScore,
          playedScore: nextScore,
          isBookMove: false,
        });
        currentScore = nextScore;
      }
    }

    const res = evaluateGame(moves, { winnerColor: 'b' });
    expect(res.black.level).toBe('AI_FLAG'); // 0 loss & 100% best move
    expect(['LV_1', 'LV_2', 'LV_3']).toContain(res.white.level);
    // Weighted average (0.6*8 + 0.4*2 = 5.6 -> LV_5B) prevents collapse to loser's level
    expect(res.overallLevel).toBe('LV_5B');
  });
});
