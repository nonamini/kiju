/**
 * Post-Match Review & AI Move Analysis Modal.
 * Shows:
 * 1. Full-match Centipawn Evaluation Chart (Sente vs Gote)
 * 2. Perspective Tabs: 全局 (All), 先手視点 (Sente ▲), 後手視点 (Gote △)
 * 3. Pickups for both Good Moves (好手・妙手) and Blunders (悪手・疑問手)
 * 4. One-click Jump to examine and study alternative branches in Study mode
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strict TypeScript without 'any' (Rule 2).
 */

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MoveEvaluation } from '../../types/shogi';
import { StudioMatchOutcome } from '../kifu/StudioMatchResultModal';
import { loadQuizPool } from '../../utils/quizPoolStorage';
import { cpToWinRate, evaluateGame } from '../../utils/gameEvaluationEngine';
import { MoveAnalysisInput, QualityLevel } from '../../types/evaluation';
import { RadarChart } from '../eval/RadarChart';
import { jkfMoveToUsi, JkfMoveData } from '../../utils/studioQuizExtractor';

export type MoveQualityType = 'brilliant' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export interface AnalyzedMoveItem {
  ply: number;
  moveText: string;
  color: 0 | 1; // 0: Sente, 1: Gote
  isPlayerMove: boolean;
  scoreDiff: number; // Positive = gain for mover, Negative = loss for mover
  winRateDiff: number; // Positive = gain (pt), Negative = loss (pt) from mover POV
  winRateBefore: number; // Mover POV expected win rate (0..100)
  winRateAfter: number; // Mover POV expected win rate (0..100)
  type: MoveQualityType;
  evalBefore: number;
  evalAfter: number;
}

export interface StudioMatchReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  outcome: StudioMatchOutcome | null;
  winnerColor?: 'b' | 'w' | null;
  totalPlies: number;
  senteName: string;
  goteName: string;
  isPlayerSente: boolean;
  evalHistory: Map<number, MoveEvaluation>;
  getMoveText?: (ply: number) => string;
  getMoveAtPly?: (ply: number) => JkfMoveData | null | undefined;
  onJumpToPlyAndStudy: (ply: number) => void;
  onRematch: () => void;
}

type ReviewPerspectiveTab = 'all' | 'sente' | 'gote';

export const StudioMatchReviewModal: React.FC<StudioMatchReviewModalProps> = (props) => {
  if (!props.isOpen) return null;
  return <StudioMatchReviewModalContent {...props} />;
};

const StudioMatchReviewModalContent: React.FC<StudioMatchReviewModalProps> = ({
  onClose,
  outcome,
  winnerColor,
  totalPlies,
  senteName,
  goteName,
  isPlayerSente,
  evalHistory,
  getMoveText,
  getMoveAtPly,
  onJumpToPlyAndStudy,
  onRematch,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<ReviewPerspectiveTab>('all');
  const [filterMode, setFilterMode] = useState<'all' | 'good' | 'bad'>('all');

  // Compute all analyzed moves using v2.0 ΔWR criteria + out-of-range winning tolerance
  const analyzedMoves = useMemo(() => {
    const list: AnalyzedMoveItem[] = [];
    const maxPly = Math.min(totalPlies, Math.max(0, ...Array.from(evalHistory.keys())));

    for (let p = 1; p <= maxPly; p++) {
      const prevEval = evalHistory.get(p - 1)?.scoreCp ?? 0;
      const currEval = evalHistory.get(p)?.scoreCp;
      if (currEval === undefined) continue;

      // Color who made the move at ply p:
      // Odd p (1, 3, 5...) is Sente (0)
      // Even p (2, 4, 6...) is Gote (1)
      const color: 0 | 1 = p % 2 === 1 ? 0 : 1;
      const isPlayerTurn = color === (isPlayerSente ? 0 : 1);

      // Score diff from mover's perspective:
      // Sente gains when currEval > prevEval (diff = currEval - prevEval)
      // Gote gains when currEval < prevEval (diff = prevEval - currEval)
      const scoreDiff = color === 0 ? currEval - prevEval : prevEval - currEval;

      // 30cp shallow-search noise floor
      if (Math.abs(scoreDiff) <= 30) continue;

      const moverBefore = color === 0 ? prevEval : -prevEval;
      const moverAfter = color === 0 ? currEval : -currEval;
      const winRateBefore = cpToWinRate(moverBefore);
      const winRateAfter = cpToWinRate(moverAfter);
      const winRateDiff = Math.round((winRateAfter - winRateBefore) * 10) / 10;

      // Out-of-range clamp (±2000cp), except throwing away a winning lead (< +600cp with >= 20pt drop)
      const threwAwayLead =
        moverBefore > 2000 && moverAfter < 600 && winRateBefore - winRateAfter >= 20.0;
      if (Math.abs(moverBefore) > 2000 && !threwAwayLead) continue;

      const winRateLoss = winRateBefore - winRateAfter;
      const winRateGain = winRateAfter - winRateBefore;

      let type: MoveQualityType | null = null;
      if (winRateLoss >= 20.0) {
        type = 'blunder'; // 大悪手
      } else if (winRateLoss >= 10.0) {
        type = 'mistake'; // 悪手
      } else if (winRateLoss >= 5.0) {
        type = 'inaccuracy'; // 疑問手
      } else if (Math.abs(moverBefore) <= 2000) {
        if (winRateGain >= 15.0 || (scoreDiff >= 400 && winRateGain >= 8.0)) {
          type = 'brilliant'; // 妙手 / 勝勢決定打
        } else if (winRateGain >= 7.0 || (scoreDiff >= 180 && winRateGain >= 5.0)) {
          type = 'good'; // 好手
        }
      }

      if (type) {
        const moveText = getMoveText ? getMoveText(p) : `${p}手目`;
        list.push({
          ply: p,
          moveText,
          color,
          isPlayerMove: isPlayerTurn,
          scoreDiff,
          winRateDiff,
          winRateBefore,
          winRateAfter,
          type,
          evalBefore: prevEval,
          evalAfter: currEval,
        });
      }
    }

    return list;
  }, [totalPlies, evalHistory, isPlayerSente, getMoveText]);

  // Filter moves based on selected perspective tab and filter mode
  const filteredMoves = useMemo(() => {
    return analyzedMoves.filter((m) => {
      // Perspective filter
      if (activeTab === 'sente' && m.color !== 0) return false;
      if (activeTab === 'gote' && m.color !== 1) return false;

      // Quality mode filter
      if (filterMode === 'good' && m.scoreDiff <= 0) return false;
      if (filterMode === 'bad' && m.scoreDiff >= 0) return false;

      return true;
    }).sort((a, b) => {
      // Sort by absolute expected win-rate impact descending
      return Math.abs(b.winRateDiff) - Math.abs(a.winRateDiff);
    });
  }, [analyzedMoves, activeTab, filterMode]);

  // Counts for summary pills
  const stats = useMemo(() => {
    let senteGood = 0;
    let senteBad = 0;
    let goteGood = 0;
    let goteBad = 0;

    for (const m of analyzedMoves) {
      if (m.color === 0) {
        if (m.scoreDiff > 0) senteGood++;
        else senteBad++;
      } else {
        if (m.scoreDiff > 0) goteGood++;
        else goteBad++;
      }
    }

    return { senteGood, senteBad, goteGood, goteBad };
  }, [analyzedMoves]);

  // Level labels and color styles helper
  const getLevelBadge = (level: QualityLevel) => {
    switch (level) {
      case 'AI_FLAG':
        return { label: t('studio.match_review.level_ai_flag', '完全整合 (AI水準)'), bg: 'bg-purple-500/20 text-purple-300 border-purple-500/40' };
      case 'LV_5A':
        return { label: t('studio.match_review.level_5a', '極高 (名局級)'), bg: 'bg-amber-500/25 text-amber-300 border-amber-500/50' };
      case 'LV_5B':
        return { label: t('studio.match_review.level_5b', 'プロ公式戦水準'), bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' };
      case 'LV_5C':
        return { label: t('studio.match_review.level_5c', 'トップアマ水準'), bg: 'bg-teal-500/20 text-teal-300 border-teal-500/40' };
      case 'LV_4':
        return { label: t('studio.match_review.level_4', 'アマ高段者水準'), bg: 'bg-blue-500/20 text-blue-300 border-blue-500/40' };
      case 'LV_3':
        return { label: t('studio.match_review.level_3', 'アマ有段者水準'), bg: 'bg-sky-500/20 text-sky-300 border-sky-500/40' };
      case 'LV_2':
        return { label: t('studio.match_review.level_2', '級位者水準'), bg: 'bg-slate-700/60 text-slate-300 border-slate-600' };
      case 'LV_1':
      default:
        return { label: t('studio.match_review.level_1', '初学者水準'), bg: 'bg-rose-500/20 text-rose-300 border-rose-500/40' };
    }
  };

  // Run Game Evaluation Engine on the match
  const gameEvaluation = useMemo(() => {
    if (evalHistory.size < 4) return null;
    const inputs: MoveAnalysisInput[] = [];

    const maxPly = Math.min(totalPlies, Math.max(0, ...Array.from(evalHistory.keys())));
    for (let p = 1; p <= maxPly; p++) {
      const prev = evalHistory.get(p - 1);
      const curr = evalHistory.get(p);
      if (!curr) continue;

      const turn = p % 2 === 1 ? 'b' : 'w';
      const bestScore = prev?.scoreCp ?? curr.scoreCp;
      const playedScore = curr.scoreCp;

      // Extract the actual move played at ply p
      let playedMove = curr.bestMove || '7g7f';
      if (getMoveAtPly) {
        try {
          const moveData = getMoveAtPly(p);
          if (moveData) {
            playedMove = jkfMoveToUsi(moveData);
          }
        } catch {
          // fallback
        }
      }

      // bestMove is the engine recommendation before the move (from ply p - 1)
      const bestMove = prev?.bestMove || curr.bestMove || playedMove;

      inputs.push({
        ply: p,
        turn,
        playedMove,
        bestMove,
        bestScore,
        playedScore,
        isBookMove: p <= 30,
      });
    }

    if (inputs.length < 4) return null;

    let resolvedWinnerColor: 'b' | 'w' | null = winnerColor ?? null;
    if (outcome) {
      const isPlayerWin =
        outcome === 'win' ||
        outcome === 'resign_win' ||
        outcome === 'mate_win' ||
        outcome === 'timeout_win' ||
        outcome === 'impasse_win';
      const isPlayerLoss =
        outcome === 'loss' ||
        outcome === 'resign_lose' ||
        outcome === 'mate_lose' ||
        outcome === 'timeout_loss' ||
        outcome === 'impasse_lose';

      if (isPlayerWin) {
        resolvedWinnerColor = isPlayerSente ? 'b' : 'w';
      } else if (isPlayerLoss) {
        resolvedWinnerColor = isPlayerSente ? 'w' : 'b';
      }
    }

    try {
      return evaluateGame(inputs, { winnerColor: resolvedWinnerColor });
    } catch {
      return null;
    }
  }, [evalHistory, totalPlies, outcome, winnerColor, isPlayerSente]);

  // Load registered quiz IDs to show badge on cards
  const registeredQuizPlies = useMemo(() => {
    try {
      const pool = loadQuizPool();
      const plies = new Set<number>();
      for (const card of pool) {
        // card.ply is 0-indexed ply (before move), card is created for move at card.ply + 1
        plies.add(card.ply + 1);
      }
      return plies;
    } catch {
      return new Set<number>();
    }
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 backdrop-blur-sm animate-fade-in font-sans">
      <div className="bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden text-slate-100">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">📊</span>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-amber-300">
                {t('studio.match_review.title', '対局AI分析 & 好手・悪手レビュー')}
              </h2>
              <p className="text-[11px] text-slate-400">
                ▲ {senteName} vs △ {goteName} ({totalPlies}手)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 hover:bg-slate-800 p-1.5 rounded-lg transition-colors text-sm"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs sm:text-sm text-slate-300 leading-relaxed flex-1">
          
          {/* Section 0: Game Quality Level & 5-Axis Radar Chart */}
          {gameEvaluation && (() => {
            const isSentePerspective = activeTab === 'sente' || (activeTab === 'all' && isPlayerSente);
            const playerInsight = isSentePerspective ? gameEvaluation.black : gameEvaluation.white;
            const badge = getLevelBadge(playerInsight.level);
            const blackBadge = getLevelBadge(gameEvaluation.black.level);
            const whiteBadge = getLevelBadge(gameEvaluation.white.level);
            const overallBadge = getLevelBadge(gameEvaluation.overallLevel);

            return (
              <div className="bg-slate-950/90 p-4 rounded-xl border border-amber-500/30 space-y-3.5 shadow-lg">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🏆</span>
                    <span className="font-bold text-slate-200 text-sm">{t('studio.match_review.quality_title', '対局品質＆棋力レベル判定')}</span>
                  </div>
                  <div className="flex items-center flex-wrap gap-1.5">
                    <span className="text-[11px] text-slate-400">{t('studio.match_review.overall_label', '全体:')}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${overallBadge.bg}`}>
                      {overallBadge.label}
                    </span>
                    <span className="text-slate-600 text-xs">|</span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('sente')}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition cursor-pointer ${blackBadge.bg} ${
                        isSentePerspective ? 'ring-1 ring-amber-400' : 'opacity-75 hover:opacity-100'
                      }`}
                      title={t('studio.match_review.sente_badge_tooltip', 'クリックして先手視点のレーダーチャートを表示')}
                    >
                      {t('studio.match_review.sente_badge_btn', { defaultValue: `▲先手: ${blackBadge.label}`, badge: blackBadge.label })}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('gote')}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition cursor-pointer ${whiteBadge.bg} ${
                        !isSentePerspective ? 'ring-1 ring-sky-400' : 'opacity-75 hover:opacity-100'
                      }`}
                      title={t('studio.match_review.gote_badge_tooltip', 'クリックして後手視点のレーダーチャートを表示')}
                    >
                      {t('studio.match_review.gote_badge_btn', { defaultValue: `△後手: ${whiteBadge.label}`, badge: whiteBadge.label })}
                    </button>
                  </div>
                </div>

                {/* Radar Chart & Insight Commentary Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                  {/* Radar Chart */}
                  <div className="flex flex-col items-center justify-center p-2 bg-slate-900/60 rounded-xl border border-slate-800">
                    <div className="text-[11px] font-bold text-amber-300 mb-1 flex items-center gap-1.5">
                      <span>{t('studio.match_review.radar_title', '🎯 5軸レーダーチャート')}</span>
                      <span className="text-slate-400 font-normal">
                        {t('studio.match_review.radar_perspective', {
                          defaultValue: `(${isSentePerspective ? `先手 ▲${senteName}` : `後手 △${goteName}`})`,
                          side: isSentePerspective ? `先手 ▲${senteName}` : `後手 △${goteName}`,
                        })}
                      </span>
                    </div>
                    <RadarChart scores={playerInsight.radarChart} size={230} />
                  </div>

                  {/* Summary & Metrics Detail */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">
                        {t('studio.match_review.accuracy_heading', {
                          defaultValue: `${isSentePerspective ? `▲ 先手 (${senteName})` : `△ 後手 (${goteName})`} の指し手精度:`,
                          side: isSentePerspective ? `▲ 先手 (${senteName})` : `△ 後手 (${goteName})`,
                        })}
                      </span>
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${badge.bg}`}>
                        {badge.label}
                      </span>
                    </div>

                    {/* 2-Sentence Commentary Box */}
                    <div className="rounded-xl bg-slate-900/90 border border-slate-700/80 p-3 space-y-1.5 text-xs text-slate-200">
                      <div className="text-[11px] font-bold text-amber-400 flex items-center gap-1">
                        <span>💬</span>
                        <span>{t('studio.match_review.summary_comment_title', 'AI一口講評')}</span>
                      </div>
                      <p className="leading-relaxed text-slate-300 text-[11px] sm:text-xs">
                        {playerInsight.summaryComment}
                      </p>
                    </div>

                    {/* Metrics Breakdown Grid */}
                    <div className="grid grid-cols-4 gap-1.5 text-center font-mono">
                      <div
                        className="bg-slate-900/70 p-2 rounded-lg border border-slate-800"
                        title={`平均cp損失(ACL): ${playerInsight.metrics.acl}`}
                      >
                        <div className="text-[10px] text-slate-400">{t('studio.match_review.metric_win_rate_loss', '勝率損失(ΔWR)')}</div>
                        <div className="text-xs font-bold text-amber-300">
                          {playerInsight.metrics.meanWinRateLoss ?? 0}%
                        </div>
                      </div>
                      <div className="bg-slate-900/70 p-2 rounded-lg border border-slate-800">
                        <div className="text-[10px] text-slate-400">{t('studio.match_review.metric_critical_accuracy', '急所正解率')}</div>
                        <div className="text-xs font-bold text-emerald-400">{playerInsight.metrics.criticalAccuracy}%</div>
                      </div>
                      <div className="bg-slate-900/70 p-2 rounded-lg border border-slate-800">
                        <div className="text-[10px] text-slate-400">{t('studio.match_review.metric_even_plies', '互角維持手数')}</div>
                        <div className="text-xs font-bold text-cyan-400">
                          {t('studio.match_review.metric_even_plies_val', {
                            defaultValue: `${playerInsight.metrics.evenPliesCount * 2}手`,
                            plies: playerInsight.metrics.evenPliesCount * 2,
                          })}
                        </div>
                      </div>
                      <div className="bg-slate-900/70 p-2 rounded-lg border border-slate-800">
                        <div className="text-[10px] text-slate-400">{t('studio.match_review.metric_blunder', '大悪手')}</div>
                        <div className={`text-xs font-bold ${playerInsight.metrics.blunderCount > 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                          {t('studio.match_review.metric_blunder_val', {
                            defaultValue: `${playerInsight.metrics.blunderCount}回`,
                            count: playerInsight.metrics.blunderCount,
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Section 1: Evaluation Graph */}
          <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-300 flex items-center gap-1.5">
                <span>📈</span>
                <span>{t('studio.match_review.graph_title', '対局形勢推移グラフ')}</span>
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                {t('studio.match_review.graph_progress', {
                  defaultValue: `${evalHistory.size} / ${totalPlies} 手解析済み`,
                  current: evalHistory.size,
                  total: totalPlies,
                })}
              </span>
            </div>

            <div className="h-32 w-full bg-slate-900/90 rounded-lg border border-slate-800 p-2 relative">
              <div className="absolute right-2 top-1.5 text-[9px] text-amber-400/90 font-mono">{t('studio.analysis.axis_plus_1500', '+1500 先手')}</div>
              <div className="absolute right-2 bottom-1.5 text-[9px] text-sky-400/90 font-mono">{t('studio.analysis.axis_minus_1500', '-1500 後手')}</div>

              <svg
                className="w-full h-full"
                viewBox={`0 0 ${Math.max(totalPlies, 1)} 100`}
                preserveAspectRatio="none"
              >
                {/* Midline 0 */}
                <line x1="0" y1="50" x2={totalPlies} y2="50" stroke="#475569" strokeWidth="0.8" strokeDasharray="3,3" />

                {/* Graph line */}
                {(() => {
                  const points: string[] = [];
                  for (let p = 0; p <= totalPlies; p++) {
                    const ev = evalHistory.get(p);
                    if (ev) {
                      const clamped = Math.max(-1500, Math.min(1500, ev.scoreCp));
                      const y = 50 - (clamped / 1500) * 45;
                      points.push(`${p},${y}`);
                    }
                  }
                  if (points.length < 2) return null;
                  return (
                    <polyline
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={points.join(' ')}
                    />
                  );
                })()}

                {/* Notable move dots on graph */}
                {analyzedMoves.map((m) => {
                  const ev = evalHistory.get(m.ply);
                  if (!ev) return null;
                  const clamped = Math.max(-1500, Math.min(1500, ev.scoreCp));
                  const y = 50 - (clamped / 1500) * 45;
                  
                  // Color dots: Green for Good Moves, Rose for Blunders
                  const dotColor = m.scoreDiff > 0 ? '#10b981' : (m.color === 0 ? '#f59e0b' : '#38bdf8');
                  return (
                    <circle
                      key={`dot-${m.ply}`}
                      cx={m.ply}
                      cy={y}
                      r={m.type === 'brilliant' || m.type === 'blunder' ? '4' : '3'}
                      fill={dotColor}
                      stroke="#0f172a"
                      strokeWidth="1"
                    />
                  );
                })}
              </svg>
            </div>

            <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 px-1 gap-2">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                  <span>{t('studio.match_review.legend_good', '好手・妙手')}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                  <span>{t('studio.match_review.legend_sente_bad', '▲先手の疑問手・悪手')}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" />
                  <span>{t('studio.match_review.legend_gote_bad', '△後手の疑問手・悪手')}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Perspective & Quality Tabs: Structured into clean 2 tiers to avoid any horizontal scroll */}
          <div className="space-y-2 border-b border-slate-800 pb-3">
            {/* Tier 1: Perspective Tabs (対局全体 / 先手視点 / 後手視点) */}
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 w-full">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition text-center whitespace-nowrap ${
                  activeTab === 'all'
                    ? 'bg-slate-800 text-amber-300 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t('studio.match_review.tab_all', { defaultValue: `対局全体 (${analyzedMoves.length})`, count: analyzedMoves.length })}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('sente')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'sente'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>{t('studio.match_review.tab_sente', '▲ 先手視点')}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-900 border border-slate-700/60 font-mono">
                  {t('studio.match_review.good_bad_stats', {
                    defaultValue: `好手 ${stats.senteGood} / 悪手 ${stats.senteBad}`,
                    good: stats.senteGood,
                    bad: stats.senteBad,
                  })}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('gote')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'gote'
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>{t('studio.match_review.tab_gote', '△ 後手視点')}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-900 border border-slate-700/60 font-mono">
                  {t('studio.match_review.good_bad_stats', {
                    defaultValue: `好手 ${stats.goteGood} / 悪手 ${stats.goteBad}`,
                    good: stats.goteGood,
                    bad: stats.goteBad,
                  })}
                </span>
              </button>
            </div>

            {/* Tier 2: Filter Pills (すべて / 好手・妙手のみ / 悪手・疑問手のみ) */}
            <div className="flex items-center justify-between px-1 text-xs">
              <span className="text-slate-400 text-[11px] font-medium flex items-center gap-1">
                <span>🔍</span>
                <span>{t('studio.match_review.filter_label', '手の種類で絞り込み:')}</span>
              </span>
              <div className="flex items-center gap-1 bg-slate-950/80 p-0.5 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setFilterMode('all')}
                  className={`px-3 py-1 rounded-md transition text-[11px] whitespace-nowrap ${
                    filterMode === 'all'
                      ? 'bg-slate-800 text-amber-300 font-bold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t('studio.match_review.filter_all', 'すべて')}
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('good')}
                  className={`px-3 py-1 rounded-md transition text-[11px] whitespace-nowrap ${
                    filterMode === 'good'
                      ? 'bg-emerald-950 text-emerald-300 font-bold border border-emerald-800/80 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t('studio.match_review.filter_good_only', '好手・妙手のみ')}
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('bad')}
                  className={`px-3 py-1 rounded-md transition text-[11px] whitespace-nowrap ${
                    filterMode === 'bad'
                      ? 'bg-rose-950 text-rose-300 font-bold border border-rose-800/80 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t('studio.match_review.filter_bad_only', '悪手・疑問手のみ')}
                </button>
              </div>
            </div>
          </div>

          {/* Section 2: Move Cards List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-200 text-xs sm:text-sm flex items-center gap-1.5">
                <span>🎯</span>
                <span>
                  {activeTab === 'sente'
                    ? t('studio.match_review.pickup_sente', '先手 (▲) の好手・反省手ピックアップ')
                    : activeTab === 'gote'
                    ? t('studio.match_review.pickup_gote', '後手 (△) の好手・反省手ピックアップ')
                    : t('studio.match_review.pickup_turning_points', '勝敗の分かれ目・好手悪手ピックアップ')}
                </span>
              </h4>
              <span className="text-[11px] text-slate-400">
                {filteredMoves.length > 0
                  ? t('studio.match_review.display_count', { defaultValue: `${filteredMoves.length} 箇所表示`, count: filteredMoves.length })
                  : t('studio.match_review.no_matching_moves', '該当する指し手はありません')}
              </span>
            </div>

            {filteredMoves.length === 0 ? (
              <div className="p-6 rounded-xl bg-slate-950/60 border border-slate-800 text-center text-xs text-slate-400">
                {t('studio.match_review.no_blunders_banner', '🎉 目立った悪手や急激な形勢変化はありませんでした！安定した好局です。')}
              </div>
            ) : (
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {filteredMoves.map((m) => {
                  const isGain = m.scoreDiff > 0;
                  return (
                    <div
                      key={`analyzed-${m.ply}`}
                      className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-amber-500/50 transition flex items-center justify-between group"
                    >
                      <div className="space-y-1 min-w-0 pr-3">
                        <div className="flex items-center gap-2">
                          {/* Quality Badge */}
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              m.type === 'brilliant'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                                : m.type === 'good'
                                ? 'bg-teal-950 text-teal-300 border border-teal-800/60'
                                : m.type === 'blunder'
                                ? 'bg-rose-950 text-rose-300 border border-rose-800/60'
                                : m.type === 'mistake'
                                ? 'bg-amber-950 text-amber-300 border border-amber-800/60'
                                : 'bg-blue-950 text-blue-300 border border-blue-800/60'
                            }`}
                          >
                            {m.type === 'brilliant'
                              ? t('studio.match_review.badge_brilliant', '妙手')
                              : m.type === 'good'
                              ? t('studio.match_review.badge_good', '好手')
                              : m.type === 'blunder'
                              ? t('studio.match_review.badge_blunder', '大悪手')
                              : m.type === 'mistake'
                              ? t('studio.match_review.badge_mistake', '悪手')
                              : t('studio.match_review.badge_inaccuracy', '疑問手')}
                          </span>

                          {/* Move Side Indicator */}
                          <span className={`text-[11px] font-bold ${m.color === 0 ? 'text-amber-400' : 'text-sky-400'}`}>
                            {m.color === 0 ? '▲' : '△'}
                          </span>

                          <span className="font-bold text-slate-200 text-xs sm:text-sm">
                            {m.ply}{t('studio.position_summary.last_move', { move: '' }).includes('手') ? '手目: ' : ' ply: '}{m.moveText}
                          </span>

                          {/* Quiz Auto-Registered Badge */}
                          {registeredQuizPlies.has(m.ply) && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                              <span>🎯</span>
                              <span>{t('studio.match_review.quiz_registered', 'クイズ登録済')}</span>
                            </span>
                          )}
                        </div>

                        {/* Expected Win-Rate & Centipawn Details */}
                        <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                          <span className={`font-mono font-semibold ${isGain ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isGain
                              ? t('studio.match_review.win_rate_gain', {
                                  defaultValue: `勝率上昇: +${m.winRateDiff.toFixed(1)}%`,
                                  pct: m.winRateDiff.toFixed(1),
                                })
                              : t('studio.match_review.win_rate_loss', {
                                  defaultValue: `勝率下落: ${m.winRateDiff.toFixed(1)}%`,
                                  pct: m.winRateDiff.toFixed(1),
                                })}
                          </span>
                          <span className="font-mono text-slate-300">
                            ({Math.round(m.winRateBefore)}% ➔ {Math.round(m.winRateAfter)}%)
                          </span>
                          <span className="font-mono text-slate-500">
                            {t('studio.match_review.eval_diff_details', {
                              defaultValue: `[評価値 ${m.scoreDiff > 0 ? `+${m.scoreDiff}` : m.scoreDiff} cp: ${m.evalBefore > 0 ? `+${m.evalBefore}` : m.evalBefore} ➔ ${m.evalAfter > 0 ? `+${m.evalAfter}` : m.evalAfter}]`,
                              diff: m.scoreDiff > 0 ? `+${m.scoreDiff}` : m.scoreDiff,
                              before: m.evalBefore > 0 ? `+${m.evalBefore}` : m.evalBefore,
                              after: m.evalAfter > 0 ? `+${m.evalAfter}` : m.evalAfter,
                            })}
                          </span>
                        </div>
                      </div>

                      {/* Jump to Study Button */}
                      <button
                        type="button"
                        onClick={() => onJumpToPlyAndStudy(m.ply - 1)}
                        className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs shadow transition active:scale-95 shrink-0 flex items-center gap-1"
                      >
                        <span>🔍</span>
                        <span>{t('studio.match_review.study_prev_move', '直前を検討')}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onRematch}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-semibold transition border border-slate-700 flex items-center gap-1.5"
          >
            <span>🔄</span>
            <span>{t('studio.match_review.rematch_btn', 'もう一度対局 (再戦)')}</span>
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onJumpToPlyAndStudy(totalPlies)}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold shadow transition"
            >
              {t('studio.match_review.study_from_end_btn', '終局図から検討モードへ')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
            >
              {t('common.close', '閉じる')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
