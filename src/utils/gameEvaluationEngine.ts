/**
 * Game Evaluation & Insight Engine (v2.0: Expected Win-Rate Drop ΔWR Core).
 * Implements deterministic game quality level assessment, 5-axis radar chart scoring,
 * and 2-sentence structured summary commentary based on docs/spec/game_evaluation.md (v2.0).
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import {
  GameEvaluationResult,
  MatchMetrics,
  MatchPattern,
  MoveAnalysisInput,
  PlayerInsight,
  QualityLevel,
  RadarChartScores,
} from '../types/evaluation';
import { Color } from '../types/shogi';

interface NormalizedMove {
  ply: number;
  turn: Color;
  playedMove: string;
  bestMove: string;
  isBestMove: boolean;
  scoreBeforeTurn: number; // Perspective of moving side (cp)
  scoreAfterTurn: number;  // Perspective of moving side (cp)
  winRateBefore: number;   // Expected win rate before move (0..100)
  winRateAfter: number;    // Expected win rate after move (0..100)
  loss: number;            // Raw cp loss >= 0 (cp)
  lossCapped: number;      // min(500, loss)
  winRateLoss: number;     // Win-rate drop ΔWR >= 0 (0..100 pt)
  isCritical: boolean;     // Critical junction position
  isBook: boolean;
  isEffective: boolean;    // Not in book, not in out-of-range (±2000cp unless blundered away)
  phase: 'opening' | 'midgame' | 'endgame';
}

/**
 * Converts centipawn score from mover's perspective into expected win rate percentage (0..100).
 * Standard Shogi sigmoid scale: 600cp advantage ≈ 73.1% win rate.
 */
export function cpToWinRate(cp: number): number {
  const clamped = Math.max(-6000, Math.min(6000, cp));
  return 100 / (1 + Math.exp(-clamped / 600));
}

/**
 * Evaluates a completed or analyzed game based on move analysis inputs.
 * Deterministic and client-side self-contained with no external API calls.
 */
export function evaluateGame(
  moves: MoveAnalysisInput[],
  options?: {
    matchId?: string;
    winnerColor?: Color | null;
  }
): GameEvaluationResult {
  const normalizedMoves = preprocessMoves(moves);

  const blackInsight = calculatePlayerInsight('b', normalizedMoves, options?.winnerColor);
  const whiteInsight = calculatePlayerInsight('w', normalizedMoves, options?.winnerColor);

  const overallLevel = determineOverallLevel(
    blackInsight.level,
    whiteInsight.level,
    blackInsight.isWinner,
    whiteInsight.isWinner
  );

  return {
    matchId: options?.matchId,
    overallLevel,
    black: blackInsight,
    white: whiteInsight,
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * Step 3: Normalizes and pre-processes raw move data.
 * Applies perspective sign inversion, win-rate conversion, 30cp shallow-search noise floor,
 * book truncation, ±2000cp clamp (with throw-away exception), and 500cp loss cap.
 */
function preprocessMoves(moves: MoveAnalysisInput[]): NormalizedMove[] {
  const sorted = [...moves].sort((a, b) => a.ply - b.ply);

  return sorted.map((m, index) => {
    const isSente = m.turn === 'b';
    const sign = isSente ? 1 : -1;

    // Score before this move from Sente perspective:
    // Prefer previous ply's playedScore if available; otherwise fallback to current bestScore
    let senteScoreBefore = m.bestScore;
    if (index > 0) {
      const prev = sorted[index - 1];
      if (prev) {
        senteScoreBefore = prev.playedScore;
      }
    }

    const scoreBeforeTurn = sign * senteScoreBefore;
    const scoreAfterTurn = sign * m.playedScore;

    // Raw centipawn loss on this turn
    const loss = Math.max(0, scoreBeforeTurn - scoreAfterTurn);
    const lossCapped = Math.min(500, loss);

    // Expected win rate before and after the move
    const winRateBefore = cpToWinRate(scoreBeforeTurn);
    const winRateAfter = cpToWinRate(scoreAfterTurn);

    const exactBestMatch =
      m.playedMove.trim() !== '' && m.playedMove.trim() === m.bestMove.trim();

    // Shallow-search noise floor: loss <= 30cp or exact best move match incurs 0 ΔWR
    const isNoiseFloor = exactBestMatch || loss <= 30;
    const winRateLoss = isNoiseFloor ? 0 : Math.max(0, winRateBefore - winRateAfter);

    // Hybrid Critical Moment Detection:
    // 1. If secondScore is provided: gap between 1st and 2nd candidate >= 150cp (or >= 12pt WR)
    // 2. If secondScore is omitted (single-PV analysis): competitive tension position (25% <= WR <= 75% after ply 30)
    let isCritical = false;
    if (m.secondScore !== undefined) {
      const bestScoreTurn = sign * m.bestScore;
      const secondScoreTurn = sign * m.secondScore;
      const wrGap = cpToWinRate(bestScoreTurn) - cpToWinRate(secondScoreTurn);
      isCritical = bestScoreTurn - secondScoreTurn >= 150 || wrGap >= 12.0;
    } else if (m.ply > 30) {
      isCritical = winRateBefore >= 25.0 && winRateBefore <= 75.0;
    }

    // Book move flag
    const isBook = m.isBookMove ?? m.ply <= 30;

    // Out of range (±2000cp) clamp check:
    // Exception: if player had > +2000cp and threw away the lead to < +600cp (ΔWR >= 20pt), keep as effective
    const threwAwayWinningLead =
      scoreBeforeTurn > 2000 && scoreAfterTurn < 600 && winRateLoss >= 20.0;
    const isOutOfRange = Math.abs(scoreBeforeTurn) > 2000 && !threwAwayWinningLead;
    const isEffective = !isBook && !isOutOfRange;

    // Phase categorization
    let phase: 'opening' | 'midgame' | 'endgame' = 'midgame';
    if (m.ply <= 35) {
      phase = 'opening';
    } else if (Math.abs(scoreBeforeTurn) >= 600) {
      phase = 'endgame';
    }

    // Best or near-best move (within 3.0pt win-rate loss or <= 30cp)
    const isBestMove = isNoiseFloor || winRateLoss <= 3.0;

    return {
      ply: m.ply,
      turn: m.turn,
      playedMove: m.playedMove,
      bestMove: m.bestMove,
      isBestMove,
      scoreBeforeTurn,
      scoreAfterTurn,
      winRateBefore,
      winRateAfter,
      loss,
      lossCapped,
      winRateLoss,
      isCritical,
      isBook,
      isEffective,
      phase,
    };
  });
}

/**
 * Computes individual player insight metrics, radar scores, level, and commentary.
 */
function calculatePlayerInsight(
  color: Color,
  allMoves: NormalizedMove[],
  winnerColor?: Color | null
): PlayerInsight {
  const playerMoves = allMoves.filter((m) => m.turn === color);
  const effectiveMoves = playerMoves.filter((m) => m.isEffective);

  // 1. Basic Metrics (ACL & Mean ΔWR)
  const acl =
    effectiveMoves.length > 0
      ? effectiveMoves.reduce((acc, m) => acc + m.lossCapped, 0) / effectiveMoves.length
      : 0;

  const meanWinRateLoss =
    effectiveMoves.length > 0
      ? effectiveMoves.reduce((acc, m) => acc + m.winRateLoss, 0) / effectiveMoves.length
      : 0;

  let blunderCount = 0;
  let mistakeCount = 0;
  let inaccuracyCount = 0;

  // Classify errors using expected win-rate drop (ΔWR) for automatic winning-margin tolerance
  for (const m of effectiveMoves) {
    if (m.winRateLoss >= 20.0) {
      blunderCount++;
    } else if (m.winRateLoss >= 10.0) {
      mistakeCount++;
    } else if (m.winRateLoss >= 5.0) {
      inaccuracyCount++;
    }
  }

  // Critical accuracy (percentage of picking accurate move in critical positions)
  const criticalMoves = effectiveMoves.filter((m) => m.isCritical);
  const criticalCorrect = criticalMoves.filter((m) => m.isBestMove).length;
  const criticalAccuracy =
    criticalMoves.length < 3
      ? 85
      : Math.round((criticalCorrect / criticalMoves.length) * 1000) / 10;

  // Reversal count: reached >= 70% win rate (~ +500cp) then dropped to <= 45% win rate (~ -120cp)
  let reversalCount = 0;
  let hadLead = false;
  for (const m of playerMoves) {
    if (m.winRateBefore >= 70.0) {
      hadLead = true;
    }
    if (hadLead && m.winRateAfter <= 45.0) {
      reversalCount++;
      hadLead = false; // Reset until leading again
    }
  }

  // Even tension count: How many plies tension stayed within ±200cp
  let evenPliesCount = 0;
  for (const m of playerMoves) {
    if (Math.abs(m.scoreBeforeTurn) <= 200) {
      evenPliesCount++;
    }
  }
  const evenTensionRate =
    playerMoves.length > 0 ? Math.round((evenPliesCount / playerMoves.length) * 100) : 0;

  const metrics: MatchMetrics = {
    effectiveMoves: effectiveMoves.length,
    acl: Math.round(acl * 10) / 10,
    meanWinRateLoss: Math.round(meanWinRateLoss * 10) / 10,
    criticalAccuracy,
    blunderCount,
    mistakeCount,
    inaccuracyCount,
    reversalCount,
    evenPliesCount,
    evenTensionRate,
  };

  // 2. 5-Axis Radar Chart Scores
  const radarChart = calculateRadarScores(color, playerMoves, effectiveMoves, metrics);

  // 3. Quality Level
  const bestMoveMatches = playerMoves.filter((m) => m.isBestMove).length;
  const bestMoveRate = playerMoves.length > 0 ? bestMoveMatches / playerMoves.length : 1;
  const level = determinePlayerLevel(metrics, bestMoveRate);

  // 4. Match Progression Pattern
  const isWinner =
    winnerColor !== undefined && winnerColor !== null
      ? winnerColor === color
      : isHeuristicWinner(playerMoves);
  const pattern = determineMatchPattern(allMoves, color);

  // 5. Structured Summary Commentary
  const summaryComment = generateSummaryComment(pattern, isWinner, radarChart, metrics);

  return {
    color,
    level,
    isWinner,
    metrics,
    radarChart,
    pattern,
    summaryComment,
  };
}

/**
 * 4.2 5-Axis Radar Chart Score Calculation (v2.0 Bayesian Smoothed & ΔWR Based).
 */
function calculateRadarScores(
  _color: Color,
  playerMoves: NormalizedMove[],
  effectiveMoves: NormalizedMove[],
  metrics: MatchMetrics
): RadarChartScores {
  const normFactor = 30 / Math.max(15, effectiveMoves.length);
  const normBlunders = metrics.blunderCount * normFactor;
  const normMistakes = metrics.mistakeCount * normFactor;

  // ① Opening (1..35 plies) with Bayesian smoothing (+5 dummy moves in denominator)
  const openingMoves = playerMoves.filter((m) => m.ply <= 35);
  const openingWrLossSum = openingMoves.reduce((acc, m) => acc + m.winRateLoss, 0);
  const smoothOpeningLoss = openingWrLossSum / (openingMoves.length + 5);
  let openingScore = Math.round(
    Math.max(40, Math.min(100, 100 - smoothOpeningLoss * 8.0))
  );
  const bookCount = openingMoves.filter((m) => m.isBook).length;
  if (bookCount >= 20 && smoothOpeningLoss < 2.5) {
    openingScore = Math.max(85, openingScore);
  }

  // ② Midgame (36+ plies & |V| < 600cp)
  const midMoves = playerMoves.filter((m) => m.phase === 'midgame' && m.isEffective);
  const midAvgWrLoss =
    midMoves.length > 0
      ? midMoves.reduce((acc, m) => acc + m.winRateLoss, 0) / midMoves.length
      : metrics.meanWinRateLoss ?? 0;

  // Bonus for maintaining even tension (promotes masterpiece evaluation for balanced games)
  let evenTensionBonus = 0;
  if (metrics.evenPliesCount >= 35) {
    evenTensionBonus = 15;
  } else if (metrics.evenPliesCount >= 25) {
    evenTensionBonus = 8;
  }

  const midgameScore = Math.round(
    Math.max(25, Math.min(100, 100 - midAvgWrLoss * 7.0 + evenTensionBonus))
  );

  // ④ Stability (Game-length normalized error rate across all effective moves)
  const stabilityScore = Math.round(
    Math.max(15, Math.min(100, 100 - normBlunders * 22 - normMistakes * 8))
  );

  // ③ Endgame (36+ plies & |V| >= 600cp)
  // Because winRateLoss is used, safe simplifications while maintaining >=85% win rate are not penalized
  const endMoves = playerMoves.filter((m) => m.phase === 'endgame');
  let endgameScore = Math.round((midgameScore + stabilityScore) / 2);
  if (endMoves.length > 0) {
    const endBlunders = endMoves.filter((m) => m.winRateLoss >= 20.0).length;
    const endMistakes = endMoves.filter(
      (m) => m.winRateLoss >= 10.0 && m.winRateLoss < 20.0
    ).length;
    endgameScore = Math.round(
      Math.max(
        20,
        Math.min(
          100,
          100 - endBlunders * 25 - endMistakes * 10 - metrics.reversalCount * 18
        )
      )
    );
  }

  // ⑤ Tactics & Tenacity
  // Bonus: Resisted >= 10 or >= 20 plies under disadvantage (<= -500cp)
  let tenacityBonus = 0;
  const disadvantageMoves = playerMoves.filter((m) => m.scoreBeforeTurn <= -500);
  if (disadvantageMoves.length >= 20) {
    tenacityBonus = 15;
  } else if (disadvantageMoves.length >= 10) {
    tenacityBonus = 8;
  }

  const tacticsScore = Math.round(
    Math.max(25, Math.min(100, metrics.criticalAccuracy * 0.85 + tenacityBonus))
  );

  return {
    opening: openingScore,
    midgame: midgameScore,
    endgame: endgameScore,
    stability: stabilityScore,
    tactics: tacticsScore,
  };
}

/**
 * 4.3 Mapping logic for Player Quality Level (v2.0 Normalized Rate & Mean ΔWR Calibrated).
 */
function determinePlayerLevel(metrics: MatchMetrics, bestMoveRate: number): QualityLevel {
  const { acl, blunderCount, reversalCount, effectiveMoves } = metrics;
  const meanWrLoss = metrics.meanWinRateLoss ?? acl / 8;

  const normFactor = 30 / Math.max(15, effectiveMoves);
  const normBlunders = blunderCount * normFactor;

  // AI_FLAG: Mean ΔWR < 0.8pt & bestMoveRate >= 92% (and ACL < 8)
  if (meanWrLoss < 0.8 && bestMoveRate >= 0.92 && acl < 8) {
    return 'AI_FLAG';
  }

  // LV_5A (名局級): Mean ΔWR < 2.2pt & 0 Blunders & 0 Reversals, OR Long Even Masterpiece
  if (
    (meanWrLoss < 2.2 && normBlunders === 0 && reversalCount === 0) ||
    (meanWrLoss < 2.8 && metrics.evenPliesCount >= 30 && blunderCount === 0)
  ) {
    return 'LV_5A';
  }

  // LV_5B (プロ公式戦水準): Mean ΔWR < 3.5pt & NormBlunders <= 0.8
  if (
    (meanWrLoss < 3.5 && normBlunders <= 0.8) ||
    (meanWrLoss < 4.0 && metrics.evenPliesCount >= 25 && normBlunders <= 1.0)
  ) {
    return 'LV_5B';
  }

  // LV_5C (トップアマ水準): Mean ΔWR < 4.8pt & NormBlunders <= 1.5
  if (meanWrLoss < 4.8 && normBlunders <= 1.5) {
    return 'LV_5C';
  }

  // LV_4 (アマ高段者水準): Mean ΔWR < 6.5pt & NormBlunders <= 2.5
  if (meanWrLoss < 6.5 && normBlunders <= 2.5) {
    return 'LV_4';
  }

  // LV_3 (アマ有段者水準): Mean ΔWR < 9.0pt & NormBlunders <= 4.0
  if (meanWrLoss < 9.0 && normBlunders <= 4.0) {
    return 'LV_3';
  }

  // LV_2 (級位者水準): Mean ΔWR < 13.0pt
  if (meanWrLoss < 13.0) {
    return 'LV_2';
  }

  return 'LV_1';
}

/**
 * Determines overall match level using winner-weighted average (0.6 Winner + 0.4 Loser)
 * so that one player's late collapse does not mislabel a high-level game as beginner/kyu.
 */
function determineOverallLevel(
  lvlBlack: QualityLevel,
  lvlWhite: QualityLevel,
  isBlackWinner: boolean,
  isWhiteWinner: boolean
): QualityLevel {
  const rankOrder: Record<QualityLevel, number> = {
    AI_FLAG: 8,
    LV_5A: 7,
    LV_5B: 6,
    LV_5C: 5,
    LV_4: 4,
    LV_3: 3,
    LV_2: 2,
    LV_1: 1,
  };

  const rankB = rankOrder[lvlBlack] ?? 2;
  const rankW = rankOrder[lvlWhite] ?? 2;

  let weightedRank: number;
  if (isBlackWinner && !isWhiteWinner) {
    weightedRank = Math.round(rankB * 0.6 + rankW * 0.4);
  } else if (isWhiteWinner && !isBlackWinner) {
    weightedRank = Math.round(rankW * 0.6 + rankB * 0.4);
  } else {
    weightedRank = Math.round((rankB + rankW) / 2);
  }

  const clampedRank = Math.max(1, Math.min(8, weightedRank));
  const entries = Object.entries(rankOrder) as [QualityLevel, number][];
  const matched = entries.find(([, val]) => val === clampedRank);
  return matched ? matched[0] : 'LV_3';
}

/**
 * 4.4.1 Match Progression Pattern Recognition.
 */
function determineMatchPattern(allMoves: NormalizedMove[], playerColor: Color): MatchPattern {
  const totalPlies = allMoves.length;

  // CRUSH: Short game (< 60 plies) with a decisive blunder (ΔWR >= 25pt or raw loss >= 400cp)
  if (totalPlies < 60) {
    const hasMajorBlunder = allMoves.some((m) => m.winRateLoss >= 25.0 || m.loss >= 400);
    if (hasMajorBlunder) {
      return 'CRUSH';
    }
  }

  // Count zero-crossings (lead changes between positive and negative beyond ±120cp buffer)
  let leadChanges = 0;
  let prevSign = 0;
  let minScore = 0;
  let maxScore = 0;

  for (const m of allMoves) {
    const senteScore = m.turn === 'b' ? m.scoreBeforeTurn : -m.scoreBeforeTurn;
    const currentSign = Math.abs(senteScore) >= 120 ? Math.sign(senteScore) : 0;
    if (prevSign !== 0 && currentSign !== 0 && currentSign !== prevSign) {
      leadChanges++;
    }
    if (currentSign !== 0) prevSign = currentSign;

    const playerScore = playerColor === 'b' ? senteScore : -senteScore;
    minScore = Math.min(minScore, playerScore);
    maxScore = Math.max(maxScore, playerScore);
  }

  // COMEBACK: Player was in disadvantage (<= -500cp) and later surged to advantage (>= +500cp)
  if (minScore <= -500 && maxScore >= 500) {
    return 'COMEBACK';
  }

  // SEESAW: Lead changed hands 2 or more times
  if (leadChanges >= 2) {
    return 'SEESAW';
  }

  // WIRE_TO_WIRE: Maintained lead throughout from move 30 onwards
  const post30Moves = allMoves.filter((m) => m.ply > 30);
  const neverFellBehind = post30Moves.every((m) => {
    const senteScore = m.turn === 'b' ? m.scoreBeforeTurn : -m.scoreBeforeTurn;
    const playerScore = playerColor === 'b' ? senteScore : -senteScore;
    return playerScore >= -100;
  });

  if (neverFellBehind && post30Moves.length > 0) {
    return 'WIRE_TO_WIRE';
  }

  return 'WIRE_TO_WIRE';
}

/**
 * 4.4.2 2-Sentence Commentary Generator.
 */
function generateSummaryComment(
  pattern: MatchPattern,
  isWinner: boolean,
  scores: RadarChartScores,
  metrics?: MatchMetrics
): string {
  // Sentence 1: Pattern Overview
  let sentence1 = '';

  // Special praise for games that maintained balanced tension for 60+ total plies
  if (metrics && metrics.evenPliesCount >= 30) {
    const totalEvenPlies = metrics.evenPliesCount * 2;
    sentence1 = isWinner
      ? `深い構想がぶつかり合い、${totalEvenPlies}手にわたって緊迫した互角が維持された名局を制しました。`
      : `双方の構想が拮抗し、${totalEvenPlies}手にわたり張り詰めた互角が続いた素晴らしい激戦でした。`;
  } else {
    switch (pattern) {
      case 'WIRE_TO_WIRE':
        sentence1 = isWinner
          ? '序盤から主導権を握り、相手に反撃の隙を与えず押し切った完勝譜です。'
          : '序盤の遅れを取り戻せず、相手の正確な指し回しに圧倒された一局でした。';
        break;
      case 'COMEBACK':
        sentence1 = isWinner
          ? '中盤の劣勢を粘り強い指し回しで耐え凌ぎ、終盤の好機を捉えて見事に逆転しました。'
          : '中盤まで優勢に進めていましたが、終盤の寄せ合いで痛恨の緩手が出て逆転を許しました。';
        break;
      case 'SEESAW':
        sentence1 = isWinner
          ? '互いに譲らない大熱戦となり、最後の最後まで勝敗の行方が分からない激戦を制しました。'
          : '激しい攻防が続いた大混戦でしたが、最終盤のわずかな差で惜しくも競り負けました。';
        break;
      case 'CRUSH':
        sentence1 = isWinner
          ? '相手の踏み込みの乱れを鋭くとがめ、一気の急襲で勝勢を確立しました。'
          : '序盤の仕掛けで致命的な見落としが生じ、一気に陣形を崩されてしまいました。';
        break;
    }
  }

  // Sentence 2: Feature Highlight
  let sentence2 = '';
  if (scores.stability >= 90) {
    sentence2 = '対局を通じて目立った悪手やポカが一切なく、極めて精度の高い指し手が維持されています。';
  } else if (!isWinner && scores.endgame <= 45) {
    sentence2 = '勝ち筋があった局面での速度計算・自玉の安全度管理に課題が残りました。';
  } else if (scores.tactics >= 85) {
    sentence2 = '局面の分岐点となる急所での踏み込みが極めて鋭く、勝負どころを的確に制しました。';
  } else if (scores.midgame >= 85) {
    sentence2 = '中盤のねじり合いにおける構想力と、遊び駒を作らない手厚い指し回しが光りました。';
  } else if (scores.stability <= 50) {
    sentence2 = '中盤から終盤にかけて形勢を損ねる手が散見されたため、ミスの削減が今後の明確なテーマとなります。';
  } else {
    sentence2 = '全体としてバランスの取れた安定した指し回しでした。';
  }

  return `${sentence1} ${sentence2}`;
}

/**
 * Heuristic winner fallback based on the final move evaluation score.
 */
function isHeuristicWinner(playerMoves: NormalizedMove[]): boolean {
  if (playerMoves.length === 0) return false;
  const lastMove = playerMoves[playerMoves.length - 1];
  return lastMove ? lastMove.scoreAfterTurn >= 0 : false;
}
