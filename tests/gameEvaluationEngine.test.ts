import { describe, it, expect } from 'vitest';
import { evaluateGame, cpToWinRate } from '../src/utils/gameEvaluationEngine';
import { MoveAnalysisInput } from '../src/types/evaluation';

describe('gameEvaluationEngine v2.0 (ΔWR Core)', () => {
  it('converts centipawns to expected win rate accurately', () => {
    expect(cpToWinRate(0)).toBeCloseTo(50.0, 1);
    expect(cpToWinRate(600)).toBeCloseTo(73.1, 1);
    expect(cpToWinRate(-600)).toBeCloseTo(26.9, 1);
    expect(cpToWinRate(1200)).toBeCloseTo(88.1, 1);
  });

  it('correctly evaluates a high-accuracy masterpiece game (LV_5A / LV_5B)', () => {
    // 70 moves game, both sides playing near best moves
    const mockMoves: MoveAnalysisInput[] = [];
    for (let ply = 1; ply <= 70; ply++) {
      const turn = ply % 2 === 1 ? 'b' : 'w';
      const baseScore = turn === 'b' ? 80 : 70;
      mockMoves.push({
        ply,
        turn,
        playedMove: '7g7f',
        bestMove: '7g7f',
        bestScore: baseScore,
        playedScore: baseScore - 5,
        secondScore: baseScore - 180, // critical
        isBookMove: ply <= 30,
      });
    }

    const res = evaluateGame(mockMoves, { matchId: 'test_game_1', winnerColor: 'b' });

    expect(res.matchId).toBe('test_game_1');
    expect(res.black.metrics.acl).toBeLessThan(15);
    expect(res.black.metrics.meanWinRateLoss).toBeLessThan(1.0);
    expect(res.black.metrics.blunderCount).toBe(0);
    expect(res.black.metrics.evenPliesCount * 2).toBeGreaterThanOrEqual(60);
    expect(res.black.radarChart.stability).toBeGreaterThanOrEqual(90);
    expect(res.black.summaryComment).toContain('緊迫した互角が維持された名局');
    expect(res.black.summaryComment).toContain('極めて精度の高い指し手が維持されています');
  });

  it('grants winning-margin tolerance: +1200cp -> +850cp (-350cp) in endgame is NOT counted as a blunder', () => {
    const mockMoves: MoveAnalysisInput[] = [];
    let currentScore = 0;

    for (let ply = 1; ply <= 70; ply++) {
      const turn = ply % 2 === 1 ? 'b' : 'w';
      const prevScore = currentScore;

      if (ply <= 40) {
        currentScore = ply * 30; // Gradually reaches +1200cp for Black
      } else if (ply === 51 && turn === 'b') {
        // Black plays a safe simplification move at +1200cp, dropping raw cp by 350cp to +850cp
        // Win rate changes from 88.1% to 80.5% (ΔWR = 7.6pt < 10pt Mistake / 20pt Blunder)
        currentScore = 850;
      } else {
        currentScore = 1100;
      }

      mockMoves.push({
        ply,
        turn,
        playedMove: '2b3c',
        bestMove: '7g7f',
        bestScore: prevScore,
        playedScore: currentScore,
        isBookMove: ply <= 30,
      });
    }

    const res = evaluateGame(mockMoves, { winnerColor: 'b' });
    expect(res.black.metrics.blunderCount).toBe(0);
    expect(res.black.metrics.mistakeCount).toBe(0);
    expect(res.black.radarChart.endgame).toBeGreaterThanOrEqual(90);
    expect(['LV_5A', 'LV_5B', 'LV_5C']).toContain(res.black.level);
  });

  it('prevents 1-move collapse in opening score via Bayesian smoothing', () => {
    const mockMoves: MoveAnalysisInput[] = [];
    for (let ply = 1; ply <= 50; ply++) {
      const turn = ply % 2 === 1 ? 'b' : 'w';
      // At ply 31 (opening phase), Black drops from +100cp to -250cp
      const score = ply === 31 ? -250 : 100;
      mockMoves.push({
        ply,
        turn,
        playedMove: '2g2f',
        bestMove: '7g7f',
        bestScore: 100,
        playedScore: score,
        isBookMove: ply <= 30,
      });
    }

    const res = evaluateGame(mockMoves, { winnerColor: 'b' });
    // Even with a single noticeable opening slip, opening score does not collapse to 0
    expect(res.black.radarChart.opening).toBeGreaterThanOrEqual(70);
  });

  it('computes overallLevel using winner-weighted average instead of min()', () => {
    const mockMoves: MoveAnalysisInput[] = [];
    // Black plays near-perfectly, White blunders repeatedly in midgame
    let senteScore = 100;
    for (let ply = 1; ply <= 70; ply++) {
      const turn = ply % 2 === 1 ? 'b' : 'w';
      const prev = senteScore;
      if (turn === 'w' && ply > 30 && ply <= 46) {
        // White repeatedly drops from 0 to +600 Sente advantage
        senteScore = 650;
      } else if (turn === 'b' && ply > 30 && ply <= 45) {
        senteScore = 50; // Reset to test multiple White blunders
      }
      mockMoves.push({
        ply,
        turn,
        playedMove: turn === 'b' ? '7g7f' : '3c3d',
        bestMove: '7g7f',
        bestScore: prev,
        playedScore: senteScore,
        isBookMove: ply <= 30,
      });
    }

    const res = evaluateGame(mockMoves, { winnerColor: 'b' });
    expect(['LV_5A', 'LV_5B', 'AI_FLAG']).toContain(res.black.level);
    expect(['LV_1', 'LV_2', 'LV_3']).toContain(res.white.level);
    // Overall level is weighted toward winner, so it does not drop all the way to White's level
    expect(res.overallLevel).not.toBe(res.white.level);
  });

  it('correctly detects a comeback reversal game (COMEBACK)', () => {
    const mockMoves: MoveAnalysisInput[] = [];

    // Early game: Black falls into deep trouble (-800cp for Black)
    for (let ply = 1; ply <= 40; ply++) {
      const turn = ply % 2 === 1 ? 'b' : 'w';
      mockMoves.push({
        ply,
        turn,
        playedMove: '7g7f',
        bestMove: '7g7f',
        bestScore: -800,
        playedScore: -800,
        isBookMove: ply <= 20,
      });
    }

    // Late game: White blunders, Black surges to +1200cp
    for (let ply = 41; ply <= 80; ply++) {
      const turn = ply % 2 === 1 ? 'b' : 'w';
      mockMoves.push({
        ply,
        turn,
        playedMove: turn === 'w' ? '3c3d' : '7g7f',
        bestMove: '7g7f',
        bestScore: turn === 'w' ? -800 : 1200,
        playedScore: turn === 'w' ? 1200 : 1200, // White makes massive blunders
        isBookMove: false,
      });
    }

    const res = evaluateGame(mockMoves, { winnerColor: 'b' });

    expect(res.black.pattern).toBe('COMEBACK');
    expect(res.black.summaryComment).toContain('見事に逆転しました');
    expect(res.white.summaryComment).toContain('逆転を許しました');
  });

  it('correctly detects a crush in a short game (< 60 plies with major blunder)', () => {
    const mockMoves: MoveAnalysisInput[] = [];
    for (let ply = 1; ply <= 45; ply++) {
      const turn = ply % 2 === 1 ? 'b' : 'w';
      const isBlunderPly = ply === 35;
      mockMoves.push({
        ply,
        turn,
        playedMove: isBlunderPly ? '9g9f' : '7g7f',
        bestMove: '7g7f',
        bestScore: 200,
        playedScore: isBlunderPly ? -600 : 200,
        isBookMove: ply <= 20,
      });
    }

    const res = evaluateGame(mockMoves, { winnerColor: 'b' });
    expect(res.black.pattern).toBe('CRUSH');
    expect(res.black.summaryComment).toContain('一気の急襲で勝勢を確立しました');
  });
});
