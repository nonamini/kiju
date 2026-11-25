/**
 * Per-Player AI Evaluation Aggregator & Auto-Commentary Engine (#58b).
 * Summarizes individual game evaluations into compact KifuEvaluationSummary
 * metadata and aggregates per-player accuracy level, 5-axis radar chart scores,
 * error rates, dominant match patterns, and 2-sentence style commentary.
 * Follows Rule 1: strictly English code, comments, and identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import type {
  MatchPattern,
  MoveAnalysisInput,
  PlayerInsight,
  QualityLevel,
  RadarChartScores,
} from '../types/evaluation';
import type {
  KifuEvaluationSummary,
  KifuRecord,
  KifuSideEvaluationSummary,
} from '../types/kifuRecord';
import { evaluateGame } from './gameEvaluationEngine';
import { jkfMoveToUsi, type JkfMoveData } from './studioQuizExtractor';

export type RadarAxisKey = keyof RadarChartScores;

export interface PlayerOverallEvaluation {
  analyzedGamesCount: number;
  totalGamesCount: number;
  overallLevel: QualityLevel;
  avgMeanWinRateLoss: number;
  avgAcl: number;
  avgCriticalAccuracy: number;
  avgBlundersPerGame: number;
  avgMistakesPerGame: number;
  radarChart: RadarChartScores;
  dominantPattern: MatchPattern;
  patternCounts: Record<MatchPattern, number>;
  strongestAxis: RadarAxisKey;
  weakestAxis: RadarAxisKey;
  overallComment: string;
}

export interface QualityLevelBadgeMeta {
  labelKey: string;
  defaultLabel: string;
  badgeClass: string;
}

const RANK_ORDER: Record<QualityLevel, number> = {
  AI_FLAG: 8,
  LV_5A: 7,
  LV_5B: 6,
  LV_5C: 5,
  LV_4: 4,
  LV_3: 3,
  LV_2: 2,
  LV_1: 1,
};

const RANK_TO_LEVEL: Record<number, QualityLevel> = {
  8: 'AI_FLAG',
  7: 'LV_5A',
  6: 'LV_5B',
  5: 'LV_5C',
  4: 'LV_4',
  3: 'LV_3',
  2: 'LV_2',
  1: 'LV_1',
};

const AXIS_LABELS_JA: Record<RadarAxisKey, string> = {
  opening: '序盤力',
  midgame: '中盤力',
  endgame: '終盤力',
  stability: '安定度',
  tactics: '勝負強さ',
};

/**
 * Maps a QualityLevel to i18n keys and Tailwind badge classes.
 */
export function getQualityLevelBadgeMeta(level: QualityLevel): QualityLevelBadgeMeta {
  switch (level) {
    case 'AI_FLAG':
      return {
        labelKey: 'players_page.eval_level_ai',
        defaultLabel: '完全整合 (AI水準)',
        badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
      };
    case 'LV_5A':
      return {
        labelKey: 'players_page.eval_level_5a',
        defaultLabel: '極高 (名局級)',
        badgeClass: 'bg-amber-500/25 text-amber-300 border-amber-500/50',
      };
    case 'LV_5B':
      return {
        labelKey: 'players_page.eval_level_5b',
        defaultLabel: 'プロ公式戦水準',
        badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      };
    case 'LV_5C':
      return {
        labelKey: 'players_page.eval_level_5c',
        defaultLabel: 'トップアマ水準',
        badgeClass: 'bg-teal-500/20 text-teal-300 border-teal-500/40',
      };
    case 'LV_4':
      return {
        labelKey: 'players_page.eval_level_4',
        defaultLabel: 'アマ高段者水準',
        badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
      };
    case 'LV_3':
      return {
        labelKey: 'players_page.eval_level_3',
        defaultLabel: 'アマ有段者水準',
        badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
      };
    case 'LV_2':
      return {
        labelKey: 'players_page.eval_level_2',
        defaultLabel: '級位者水準',
        badgeClass: 'bg-slate-700/60 text-slate-300 border-slate-600',
      };
    case 'LV_1':
    default:
      return {
        labelKey: 'players_page.eval_level_1',
        defaultLabel: '初学者水準',
        badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      };
  }
}

function toSideSummary(insight: PlayerInsight): KifuSideEvaluationSummary {
  return {
    level: insight.level,
    isWinner: insight.isWinner,
    meanWinRateLoss: insight.metrics.meanWinRateLoss ?? 0,
    acl: insight.metrics.acl,
    criticalAccuracy: insight.metrics.criticalAccuracy,
    blunderCount: insight.metrics.blunderCount,
    mistakeCount: insight.metrics.mistakeCount,
    inaccuracyCount: insight.metrics.inaccuracyCount,
    radarChart: { ...insight.radarChart },
    pattern: insight.pattern,
  };
}

/**
 * Computes a lightweight KifuEvaluationSummary from a hydrated KifuRecord's
 * evaluations map. Returns undefined if fewer than 4 plies are evaluated.
 */
export function computeKifuEvaluationSummary(
  rec: Pick<KifuRecord, 'evaluations' | 'jkfJson' | 'totalPlies' | 'winner'>
): KifuEvaluationSummary | undefined {
  const evalEntries = rec.evaluations;
  if (!evalEntries) return undefined;

  const evalKeys = Object.keys(evalEntries)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n) && n >= 0);
  if (evalKeys.length < 4) return undefined;

  let parsedMoves: Array<{ move?: JkfMoveData }> = [];
  if (rec.jkfJson && rec.jkfJson !== '{}') {
    try {
      const parsed = JSON.parse(rec.jkfJson) as { moves?: Array<{ move?: JkfMoveData }> };
      if (Array.isArray(parsed?.moves)) {
        parsedMoves = parsed.moves;
      }
    } catch {
      parsedMoves = [];
    }
  }

  const maxEvalKey = Math.max(0, ...evalKeys);
  const maxPly = rec.totalPlies > 0 ? Math.min(rec.totalPlies, maxEvalKey) : maxEvalKey;

  const inputs: MoveAnalysisInput[] = [];
  for (let p = 1; p <= maxPly; p++) {
    const prev = evalEntries[p - 1];
    const curr = evalEntries[p];
    if (!curr) continue;

    const turn = p % 2 === 1 ? 'b' : 'w';
    const bestScore = prev?.scoreCp ?? curr.scoreCp;
    const playedScore = curr.scoreCp;
    const secondScore =
      prev?.candidates && prev.candidates.length >= 2
        ? prev.candidates[1]?.scoreCp
        : undefined;

    let playedMove = curr.bestMove || '7g7f';
    const rawMove = parsedMoves[p]?.move;
    if (rawMove && rawMove.to) {
      try {
        playedMove = jkfMoveToUsi(rawMove);
      } catch {
        // Fallback to bestMove placeholder when move conversion fails
      }
    }

    const bestMove = prev?.bestMove || curr.bestMove || playedMove;
    inputs.push({
      ply: p,
      turn,
      playedMove,
      bestMove,
      bestScore,
      playedScore,
      ...(secondScore !== undefined ? { secondScore } : {}),
      isBookMove: p <= 30,
    });
  }

  if (inputs.length < 4) return undefined;

  const winnerColor =
    rec.winner === 'sente' ? 'b' : rec.winner === 'gote' ? 'w' : null;
  const result = evaluateGame(inputs, { winnerColor });

  return {
    overallLevel: result.overallLevel,
    black: toSideSummary(result.black),
    white: toSideSummary(result.white),
  };
}

function generatePlayerOverallComment(
  analyzedCount: number,
  radarChart: RadarChartScores,
  dominantPattern: MatchPattern,
  avgBlundersPerGame: number,
  strongestAxis: RadarAxisKey,
  weakestAxis: RadarAxisKey
): string {
  let sentence1 = '';
  switch (dominantPattern) {
    case 'WIRE_TO_WIRE':
      sentence1 = `分析対象${analyzedCount}局では「押し切り・完勝型」の展開が多く、序盤から主導権を握って安定して指し進める傾向があります。`;
      break;
    case 'COMEBACK':
      sentence1 = `分析対象${analyzedCount}局では「逆転型」の展開が多く、苦しい局面でも粘り強くチャンスを待つ勝負強さが光ります。`;
      break;
    case 'SEESAW':
      sentence1 = `分析対象${analyzedCount}局では「熱戦・混戦型」の展開が多く、互いに譲らない激しい攻防に持ち込む力戦派の棋風です。`;
      break;
    case 'CRUSH':
      sentence1 = `分析対象${analyzedCount}局では「急戦・速攻型」の展開が多く、序盤から鋭く仕掛けて短期決戦に持ち込む傾向が見られます。`;
      break;
  }

  const strongLabel = AXIS_LABELS_JA[strongestAxis];
  const strongVal = radarChart[strongestAxis];
  const weakLabel = AXIS_LABELS_JA[weakestAxis];
  const weakVal = radarChart[weakestAxis];

  let sentence2 = '';
  if (avgBlundersPerGame <= 0.3 && radarChart.stability >= 85) {
    sentence2 = `特に「${strongLabel}（${strongVal}点）」が突出しており、通算でも大悪手が極めて少ない安定した指し手精度を維持しています。`;
  } else if (weakVal < 65) {
    sentence2 = `「${strongLabel}（${strongVal}点）」が大きな武器である一方、「${weakLabel}（${weakVal}点）」の底上げがさらなる棋力向上の鍵となります。`;
  } else {
    sentence2 = `「${strongLabel}（${strongVal}点）」を中心に5領域が高水準でバランスよくまとまっています。`;
  }

  return `${sentence1} ${sentence2}`;
}

/**
 * Aggregates AI evaluation summaries across all analyzed KifuRecords
 * for a given player (selecting Sente or Gote perspective per game).
 * Returns null if no analyzed games are available.
 */
export function aggregatePlayerEvaluation(
  playerId: string,
  records: KifuRecord[]
): PlayerOverallEvaluation | null {
  let totalGamesCount = 0;
  const sideSummaries: KifuSideEvaluationSummary[] = [];

  for (const rec of records) {
    const isSente = rec.sentePlayerId === playerId;
    const isGote = rec.gotePlayerId === playerId;
    if (!isSente && !isGote) continue;

    totalGamesCount += 1;

    const summary = rec.evaluationSummary ?? computeKifuEvaluationSummary(rec);
    if (!summary) continue;

    // Pick perspective for this player (default to black if self-match edge case)
    const side = isSente ? summary.black : summary.white;
    sideSummaries.push(side);
  }

  const analyzedGamesCount = sideSummaries.length;
  if (analyzedGamesCount === 0) return null;

  let wrLossSum = 0;
  let aclSum = 0;
  let critSum = 0;
  let blunderSum = 0;
  let mistakeSum = 0;
  let rankSum = 0;

  let openSum = 0;
  let midSum = 0;
  let endSum = 0;
  let stabSum = 0;
  let tactSum = 0;

  const patternCounts: Record<MatchPattern, number> = {
    WIRE_TO_WIRE: 0,
    COMEBACK: 0,
    SEESAW: 0,
    CRUSH: 0,
  };

  for (const s of sideSummaries) {
    wrLossSum += s.meanWinRateLoss;
    aclSum += s.acl;
    critSum += s.criticalAccuracy;
    blunderSum += s.blunderCount;
    mistakeSum += s.mistakeCount;
    rankSum += RANK_ORDER[s.level] ?? 3;

    openSum += s.radarChart.opening;
    midSum += s.radarChart.midgame;
    endSum += s.radarChart.endgame;
    stabSum += s.radarChart.stability;
    tactSum += s.radarChart.tactics;

    patternCounts[s.pattern] = (patternCounts[s.pattern] ?? 0) + 1;
  }

  const radarChart: RadarChartScores = {
    opening: Math.round(openSum / analyzedGamesCount),
    midgame: Math.round(midSum / analyzedGamesCount),
    endgame: Math.round(endSum / analyzedGamesCount),
    stability: Math.round(stabSum / analyzedGamesCount),
    tactics: Math.round(tactSum / analyzedGamesCount),
  };

  const avgMeanWinRateLoss = Math.round((wrLossSum / analyzedGamesCount) * 10) / 10;
  const avgAcl = Math.round((aclSum / analyzedGamesCount) * 10) / 10;
  const avgCriticalAccuracy = Math.round((critSum / analyzedGamesCount) * 10) / 10;
  const avgBlundersPerGame = Math.round((blunderSum / analyzedGamesCount) * 10) / 10;
  const avgMistakesPerGame = Math.round((mistakeSum / analyzedGamesCount) * 10) / 10;

  const avgRank = Math.max(1, Math.min(8, Math.round(rankSum / analyzedGamesCount)));
  const overallLevel: QualityLevel = RANK_TO_LEVEL[avgRank] ?? 'LV_3';

  const patternOrder: MatchPattern[] = ['WIRE_TO_WIRE', 'SEESAW', 'COMEBACK', 'CRUSH'];
  let dominantPattern: MatchPattern = 'WIRE_TO_WIRE';
  let maxPatternCount = -1;
  for (const pat of patternOrder) {
    const count = patternCounts[pat] ?? 0;
    if (count > maxPatternCount) {
      maxPatternCount = count;
      dominantPattern = pat;
    }
  }

  const axes: RadarAxisKey[] = ['opening', 'midgame', 'endgame', 'stability', 'tactics'];
  let strongestAxis: RadarAxisKey = 'opening';
  let weakestAxis: RadarAxisKey = 'opening';
  for (const ax of axes) {
    if (radarChart[ax] > radarChart[strongestAxis]) strongestAxis = ax;
    if (radarChart[ax] < radarChart[weakestAxis]) weakestAxis = ax;
  }

  const overallComment = generatePlayerOverallComment(
    analyzedGamesCount,
    radarChart,
    dominantPattern,
    avgBlundersPerGame,
    strongestAxis,
    weakestAxis
  );

  return {
    analyzedGamesCount,
    totalGamesCount,
    overallLevel,
    avgMeanWinRateLoss,
    avgAcl,
    avgCriticalAccuracy,
    avgBlundersPerGame,
    avgMistakesPerGame,
    radarChart,
    dominantPattern,
    patternCounts,
    strongestAxis,
    weakestAxis,
    overallComment,
  };
}
