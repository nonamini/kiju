/**
 * Studio AI Engine Analysis & Evaluation Panel.
 * Shows:
 * 1. Engine selector (Fairy-Stockfish, Tuyouraou 11 Mini, Tuyouraou 11 Micro)
 * 2. Live Centipawn Evaluation Bar (-2000 to +2000 advantage gauge)
 * 3. Best move and Principal Variation (PV) formatted in Japanese notation
 * 4. Step-by-step Evaluation Timeline Graph with clear zero-line & current-ply cursor
 * Follows Rule 1: strictly English code, comments, and identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EngineId, EngineProfile, resolveEngineDisplayName } from '../../engine/engineConfig';
import { EngineSearchInfo, EngineStatus } from '../../engine/types';
import { MoveEvaluation, MultiPvCandidate } from '../../types/shogi';
import { formatEvalScore, clampEvalForChart } from '../../utils/evalChartHelper';
import { formatUsiToJapanese } from '../../utils/usiFormatter';
import { useSettings } from '../../contexts/SettingsContext';

export interface StudioAiEvalPanelProps {
  status: EngineStatus;
  isReady: boolean;
  isSearching: boolean;
  activeEngineId: EngineId;
  availableEngines: EngineProfile[];
  onSwitchEngine: (engineId: EngineId) => void;
  evaluation: MoveEvaluation | null;
  candidates?: MultiPvCandidate[];
  multiPv?: 1 | 3;
  onMultiPvChange?: (n: 1 | 3) => void;
  currentInfo: EngineSearchInfo | null;
  evalHistory: Map<number, MoveEvaluation>;
  localEvalHistory?: Map<number, MoveEvaluation>;
  evalSourceView?: 'cloud' | 'local';
  onChangeEvalSourceView?: (view: 'cloud' | 'local') => void;
  currentPly: number;
  totalPlies: number;
  currentTurn: 0 | 1;
  shogiInstance?: unknown;
  onAnalyzeCurrent: (depth?: number) => void;
  onBatchAnalyzeGame?: (forceRestart?: boolean, depth?: number) => void;
  batchProgress?: { current: number; total: number } | { currentPly: number; totalPlies: number } | null;
  onSelectPly?: (ply: number) => void;
  onPlayRecommendedMove?: (usi: string) => void;
  onOpenMatchReview?: () => void;
  className?: string;
}

export const StudioAiEvalPanel: React.FC<StudioAiEvalPanelProps> = ({
  isReady,
  isSearching,
  activeEngineId,
  availableEngines,
  onSwitchEngine,
  evaluation,
  candidates = [],
  multiPv = 3,
  onMultiPvChange,
  currentInfo,
  evalHistory,
  localEvalHistory,
  evalSourceView = 'cloud',
  onChangeEvalSourceView,
  currentPly,
  totalPlies,
  currentTurn,
  shogiInstance,
  onAnalyzeCurrent,
  onBatchAnalyzeGame,
  batchProgress,
  onSelectPly,
  onPlayRecommendedMove,
  onOpenMatchReview,
  className = '',
}) => {
  const { t } = useTranslation();
  // Configurable depth level: initialized from app settings (#47);
  // in-context override still allowed per operation.
  const { settings } = useSettings();
  const [analysisDepth, setAnalysisDepth] = useState<number>(settings.defaultAnalysisDepth);

  // Current centipawn score directly from evaluated history or live search info
  const scoreCp = evaluation?.scoreCp ?? currentInfo?.scoreCp ?? 0;
  const isMate = evaluation?.isMate ?? currentInfo?.isMate ?? false;
  const matePly = evaluation?.matePly ?? currentInfo?.matePly;

  const rawBestMove = evaluation?.bestMove ?? currentInfo?.bestMove;
  const rawPv = evaluation?.pv ?? (currentInfo?.pv ? (Array.isArray(currentInfo.pv) ? currentInfo.pv : [currentInfo.pv]) : []);

  // Format best move and PV to Japanese notation (e.g. "▲７六歩", "△６三銀打")
  const formattedBestMove = useMemo(() => {
    if (!rawBestMove) return null;
    return formatUsiToJapanese(rawBestMove, currentTurn, shogiInstance);
  }, [rawBestMove, currentTurn, shogiInstance]);

  const formattedPvList = useMemo(() => {
    if (!rawPv || rawPv.length === 0) return [];
    let turn = currentTurn;
    return rawPv.slice(0, 6).map((mStr) => {
      const res = formatUsiToJapanese(mStr, turn, shogiInstance);
      turn = (turn === 0 ? 1 : 0) as 0 | 1;
      return res;
    });
  }, [rawPv, currentTurn, shogiInstance]);

  const effectiveCandidates = useMemo(() => {
    const rawList =
      evaluation?.candidates && evaluation.candidates.length > 0
        ? evaluation.candidates
        : candidates;
    if (!rawList || rawList.length === 0) return [];
    return [...rawList].sort((a, b) => a.multipv - b.multipv).slice(0, 3);
  }, [evaluation?.candidates, candidates]);

  // Compute percentage for visual gauge (0% Gote winning, 50% Even, 100% Sente winning)
  const clampedScore = clampEvalForChart(scoreCp, 2000);
  const senteWinPct = Math.round(50 + (clampedScore / 2000) * 50);

  // Advantage description
  const advantageText = useMemo(() => {
    if (isMate) {
      if (matePly === 0) {
        return scoreCp > 0
          ? t('studio.eval_panel.mate_gote_sente_win', '後手玉詰み（先手勝ち）')
          : t('studio.eval_panel.mate_sente_gote_win', '先手玉詰み（後手勝ち）');
      }
      return scoreCp > 0
        ? t('studio.eval_panel.mate_in_ply_sente_win', '後手玉の詰み発見 ({{ply}}手・先手勝ち)', { ply: matePly })
        : t('studio.eval_panel.mate_in_ply_gote_win', '先手玉の詰み発見 ({{ply}}手・後手勝ち)', { ply: matePly });
    }
    if (scoreCp > 800) return t('studio.eval_panel.sente_winning', '先手勝勢');
    if (scoreCp > 300) return t('studio.eval_panel.sente_advantage_large', '先手優勢');
    if (scoreCp > 100) return t('studio.eval_panel.sente_advantage_small', '先手有利');
    if (scoreCp >= -100) return t('studio.eval_panel.even', '互角');
    if (scoreCp >= -300) return t('studio.eval_panel.gote_advantage_small', '後手有利');
    if (scoreCp >= -800) return t('studio.eval_panel.gote_advantage_large', '後手優勢');
    return t('studio.eval_panel.gote_winning', '後手勝勢');
  }, [scoreCp, isMate, matePly, t]);

  // Prepare ordered data points for evaluation chart
  const chartPoints = useMemo(() => {
    const list: Array<{ ply: number; scoreCp: number | null }> = [];
    const maxP = Math.max(totalPlies, currentPly, 1);
    for (let p = 0; p <= maxP; p++) {
      const e = evalHistory.get(p);
      list.push({
        ply: p,
        scoreCp: e ? clampEvalForChart(e.scoreCp, 1500) : null,
      });
    }
    return list;
  }, [evalHistory, totalPlies, currentPly]);

  return (
    <div className={`flex flex-col gap-3 p-3.5 bg-slate-900/90 border border-slate-800 rounded-xl text-slate-100 ${className}`}>
      
      {/* Engine Switcher & Depth Selector */}
      <div className="flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="text-sm shrink-0">🤖</span>
          <select
            value={activeEngineId}
            onChange={(e) => onSwitchEngine(e.target.value as EngineId)}
            className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[11px] font-semibold text-amber-300 focus:outline-none focus:border-amber-500 cursor-pointer truncate w-full"
          >
            {availableEngines.map((eng) => (
              <option key={eng.id} value={eng.id}>
                {resolveEngineDisplayName(eng, t)}
              </option>
            ))}
          </select>
          {isSearching && (
            <span className="flex h-2 w-2 relative shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>
          )}
        </div>

        {/* Compact Depth & MultiPV Selector */}
        <div className="flex items-center gap-1 shrink-0">
          {onMultiPvChange && (
            <div
              className="inline-flex rounded border border-slate-700 bg-slate-950 p-0.5 text-[10px] font-bold"
              title={t('studio.eval_panel.multipv_tooltip')}
            >
              {([1, 3] as const).map((pvCount) => (
                <button
                  key={pvCount}
                  type="button"
                  onClick={() => onMultiPvChange(pvCount)}
                  className={`px-1.5 py-0.5 rounded transition ${
                    multiPv === pvCount
                      ? 'bg-amber-500/25 text-amber-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {pvCount}
                </button>
              ))}
            </div>
          )}
          <select
            value={analysisDepth}
            onChange={(e) => setAnalysisDepth(Number(e.target.value))}
            className="bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-[11px] font-mono text-slate-300 focus:outline-none focus:border-amber-500 cursor-pointer"
            title={t('studio.eval_panel.depth_tooltip', '解析の探索深さ（大きいほど高精度だが時間がかかります）')}
          >
            <option value={8}>{t('studio.eval_panel.depth_8', '深さ 8 (速い)')}</option>
            <option value={10}>{t('studio.eval_panel.depth_10', '深さ 10 (軽快)')}</option>
            <option value={12}>{t('studio.eval_panel.depth_12', '深さ 12 (標準)')}</option>
            <option value={16}>{t('studio.eval_panel.depth_16', '深さ 16 (深層)')}</option>
          </select>
        </div>
      </div>

      {/* Centipawn Score & Advantage Gauge */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-sm text-slate-200">
            {formatEvalScore(scoreCp, isMate, matePly)}
          </span>
          <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
            scoreCp > 150
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : scoreCp < -150
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
              : 'bg-slate-800 text-slate-300'
          }`}>
            {advantageText}
          </span>
        </div>

        {/* Two-sided Progress Bar: Black (Left) vs White (Right) */}
        <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden flex border border-slate-700/60 shadow-inner">
          <div
            className={`h-full transition-all duration-300 ${
              senteWinPct >= 100
                ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-200'
                : 'bg-gradient-to-r from-amber-600 to-amber-400'
            }`}
            style={{ width: `${senteWinPct}%` }}
            title={t('studio.eval_panel.sente_win_pct_title', '先手: {{pct}}%', { pct: senteWinPct })}
          />
          <div
            className={`h-full transition-all duration-300 ${
              senteWinPct <= 0
                ? 'bg-gradient-to-r from-blue-600 via-blue-500 to-sky-300'
                : 'bg-gradient-to-r from-slate-700 to-slate-800'
            }`}
            style={{ width: `${100 - senteWinPct}%` }}
            title={t('studio.eval_panel.gote_win_pct_title', '後手: {{pct}}%', { pct: 100 - senteWinPct })}
          />
        </div>
        <div className="flex justify-between text-[10px] font-semibold px-0.5">
          <span className={senteWinPct > 50 ? 'text-amber-400 font-bold' : 'text-slate-500'}>
            {t('studio.eval_panel.sente_label_with_pct', '▲ 先手 {{pct}}%', { pct: senteWinPct })}
          </span>
          <span className="text-slate-500">50:50</span>
          <span className={senteWinPct < 50 ? 'text-blue-400 font-bold' : 'text-slate-500'}>
            {t('studio.eval_panel.gote_label_with_pct', '後手 {{pct}}% △', { pct: 100 - senteWinPct })}
          </span>
        </div>
      </div>

      {/* AI Recommendation in Japanese Notation */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 space-y-1.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-400 font-semibold">{t('studio.eval_panel.recommended_move_label', 'AI 推奨手:')}</span>
          {formattedBestMove ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => rawBestMove && onPlayRecommendedMove?.(rawBestMove)}
                disabled={!onPlayRecommendedMove || isSearching || Boolean(batchProgress)}
                className="font-bold text-amber-300 hover:text-amber-200 hover:underline cursor-pointer text-sm flex items-center gap-1 group transition"
                title={t('studio.eval_panel.play_recommendation_title', 'クリックしてこの推奨手を盤面に反映')}
              >
                <span>{formattedBestMove}</span>
                <span className="text-[10px] opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 transition">▶</span>
              </button>
            </div>
          ) : (
            <span className="text-slate-500 text-[11px]">{t('studio.eval_panel.analyzing', '解析中...')}</span>
          )}
        </div>

        {formattedPvList.length > 0 && (
          <div className="space-y-0.5">
            <span className="text-[10px] text-slate-500">{t('studio.eval_panel.pv_label', '読み筋:')}</span>
            <div className="text-[11px] text-slate-300 bg-slate-900/90 rounded px-2 py-1 flex flex-wrap gap-x-2 gap-y-0.5 leading-relaxed font-sans">
              {formattedPvList.map((pvMove, idx) => (
                <span key={`${pvMove}-${idx}`} className="hover:text-amber-300 transition">
                  {pvMove}
                </span>
              ))}
            </div>
          </div>
        )}

        {multiPv === 3 && effectiveCandidates.length > 1 && (
          <div className="space-y-1 pt-0.5">
            <div className="flex items-center justify-between text-[10px] text-slate-500">
              <span>
                {!evaluation?.candidates?.length && evalSourceView === 'cloud'
                  ? t('studio.eval_panel.candidates_title_local')
                  : t('studio.eval_panel.candidates_title')}
              </span>
              <span>{t('studio.eval_panel.candidate_score_header')}</span>
            </div>
            <div className="space-y-1">
              {effectiveCandidates.map((cand, idx) => {
                const rank = cand.multipv >= 1 ? cand.multipv : idx + 1;
                const badgeText =
                  rank === 1
                    ? t('studio.view_tier.arrow_best', '最')
                    : rank === 2
                      ? t('studio.view_tier.arrow_second', '次')
                      : String(rank);
                const badgeColorClass =
                  rank === 1
                    ? 'bg-rose-500/25 text-rose-300 border-rose-500/50'
                    : rank === 2
                      ? 'bg-amber-500/25 text-amber-300 border-amber-500/50'
                      : 'bg-violet-500/25 text-violet-300 border-violet-500/50';
                const moveLabel = formatUsiToJapanese(cand.usi, currentTurn, shogiInstance);
                return (
                  <button
                    key={`${rank}-${cand.usi}`}
                    type="button"
                    disabled={!onPlayRecommendedMove || isSearching || Boolean(batchProgress)}
                    onClick={() => onPlayRecommendedMove?.(cand.usi)}
                    className="w-full flex items-center justify-between gap-2 px-2 py-1 rounded bg-slate-900/90 hover:bg-slate-800 border border-slate-800/90 disabled:opacity-60 text-[11px] transition text-left"
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-black border shrink-0 ${badgeColorClass}`}
                      >
                        {badgeText}
                      </span>
                      <span className="font-semibold text-slate-100 truncate">
                        {moveLabel}
                      </span>
                    </span>
                    <span className="font-mono text-[10px] text-slate-400 shrink-0">
                      {formatEvalScore(cand.scoreCp, cand.isMate, cand.matePly)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Action Buttons: Clean 1-line or 2-column layout */}
        <div className="flex gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => onAnalyzeCurrent(analysisDepth)}
            disabled={!isReady || isSearching || Boolean(batchProgress)}
            className="flex-1 py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-semibold text-xs transition flex items-center justify-center gap-1.5 shadow-sm"
          >
            <span>{isSearching && !batchProgress ? '⏳' : '🔍'}</span>
            <span>{isSearching && !batchProgress ? t('studio.eval_panel.searching_label', '思考中...') : t('studio.eval_panel.analyze_current_btn', '現局面解析')}</span>
          </button>

          {onBatchAnalyzeGame && (
            evalHistory.size > 0 && !batchProgress ? (
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => onBatchAnalyzeGame(false, analysisDepth)}
                  disabled={!isReady || isSearching}
                  className="py-1.5 px-2.5 rounded-lg bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/40 disabled:opacity-50 text-amber-200 font-semibold text-xs transition flex items-center justify-center gap-1"
                  title={t('studio.eval_panel.batch_continue_title', '未解析の手数を追加解析')}
                >
                  <span>⚡ {t('studio.eval_panel.batch_continue_btn', '続き')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onBatchAnalyzeGame(true, analysisDepth)}
                  disabled={!isReady || isSearching}
                  className="py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-rose-900/40 border border-slate-700 hover:border-rose-500/40 disabled:opacity-50 text-slate-300 hover:text-rose-200 font-semibold text-xs transition flex items-center justify-center gap-1"
                  title={t('studio.eval_panel.batch_restart_title', '最初から全手を再解析')}
                >
                  <span>🔄 {t('studio.eval_panel.batch_restart_btn', '最初から')}</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onBatchAnalyzeGame(false, analysisDepth)}
                disabled={!isReady || isSearching || Boolean(batchProgress)}
                className="py-1.5 px-3 rounded-lg bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/40 disabled:opacity-50 text-amber-200 font-semibold text-xs transition flex items-center justify-center gap-1 shrink-0"
              >
                <span>
                  {batchProgress
                    ? `⚡ ${'currentPly' in batchProgress ? batchProgress.currentPly : batchProgress.current}/${'totalPlies' in batchProgress ? batchProgress.totalPlies : batchProgress.total}`
                    : `⚡ ${t('studio.eval_panel.batch_all_btn', '１局全解析')}`}
                </span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Evaluation Trend Chart with Clear Baseline & Cursor */}
      <div className="space-y-1 pt-1 border-t border-slate-800">
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <span>{t('studio.eval_panel.trend_chart_title', '形勢推移')}</span>
            <span className="text-[10px] text-slate-500 font-mono">
              {t('studio.eval_panel.analyzed_plies_count', '({{count}}手解析済)', { count: evalHistory.size })}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {onChangeEvalSourceView && (localEvalHistory?.size ?? 0) > 0 && (
              <div className="inline-flex rounded bg-slate-900 border border-slate-700 p-0.5 text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => onChangeEvalSourceView('cloud')}
                  className={`px-1.5 py-0.5 rounded transition ${
                    evalSourceView === 'cloud' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  ☁️ {t('studio.eval_panel.source_cloud', 'クラウド')}
                </button>
                <button
                  type="button"
                  onClick={() => onChangeEvalSourceView('local')}
                  className={`px-1.5 py-0.5 rounded transition ${
                    evalSourceView === 'local' ? 'bg-sky-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  💻 {t('studio.eval_panel.source_local', 'ローカル')}
                </button>
              </div>
            )}

              {onOpenMatchReview && evalHistory.size >= 2 && (
            <button
              type="button"
              onClick={onOpenMatchReview}
              className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] font-bold transition flex items-center gap-1 shadow-sm"
              title={t('studio.eval_panel.match_review_title', '１局全体の形勢グラフと悪手・疑問手を詳細レビュー')}
            >
              <span>📊</span>
              <span>{t('studio.eval_panel.match_review_btn', '悪手レビュー')}</span>
            </button>
            )}
          </div>
        </div>

        {/* Clear SVG Line Chart */}
        <div className="h-20 w-full bg-slate-950/90 rounded-lg border border-slate-800 flex flex-col justify-between p-1.5 relative overflow-hidden">
          {/* Y-axis labels */}
          <div className="absolute right-1.5 top-1 text-[8px] text-amber-400/80 font-mono pointer-events-none">
            {t('studio.eval_panel.axis_plus_1500', '+1500 先手')}
          </div>
          <div className="absolute right-1.5 bottom-1 text-[8px] text-blue-400/80 font-mono pointer-events-none">
            {t('studio.eval_panel.axis_minus_1500', '-1500 後手')}
          </div>

          <svg
            className="w-full h-full cursor-crosshair"
            viewBox={`0 0 ${Math.max(totalPlies, 1)} 100`}
            preserveAspectRatio="none"
            onClick={(e) => {
              if (!onSelectPly) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const ratio = Math.max(0, Math.min(1, clickX / rect.width));
              const targetPly = Math.round(ratio * totalPlies);
              onSelectPly(targetPly);
            }}
          >
            {/* Zero midline (50% Y = 50) */}
            <line x1="0" y1="50" x2={totalPlies} y2="50" stroke="#475569" strokeWidth="0.8" strokeDasharray="2,2" />

            {/* Evaluated area fill / polyline */}
            {(() => {
              const points = chartPoints
                .filter((p) => p.scoreCp !== null)
                .map((p) => {
                  // Y: 0 score = 50. +1500 score = 5. -1500 score = 95.
                  const y = 50 - ((p.scoreCp as number) / 1500) * 45;
                  return `${p.ply},${y}`;
                });

              if (points.length < 2) return null;

              return (
                <polyline
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={points.join(' ')}
                />
              );
            })()}

            {/* Local Spot Evaluation Overlay (Cyan) */}
            {localEvalHistory && localEvalHistory.size > 0 && (() => {
              const localPts: Array<{ ply: number; y: number }> = [];
              for (let p = 0; p <= totalPlies; p++) {
                const le = localEvalHistory.get(p);
                if (le) {
                  const clamped = clampEvalForChart(le.scoreCp, 1500);
                  const y = 50 - (clamped / 1500) * 45;
                  localPts.push({ ply: p, y });
                }
              }
              return (
                <>
                  {localPts.length >= 2 && (
                    <polyline
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="1.4"
                      strokeDasharray="2,1.5"
                      points={localPts.map((pt) => `${pt.ply},${pt.y}`).join(' ')}
                    />
                  )}
                  {localPts.map((pt) => (
                    <circle
                      key={`local-pt-${pt.ply}`}
                      cx={pt.ply}
                      cy={pt.y}
                      r="1.6"
                      fill="#38bdf8"
                    />
                  ))}
                </>
              );
            })()}

            {/* Current Ply Cursor Line */}
            <line
              x1={currentPly}
              y1="0"
              x2={currentPly}
              y2="100"
              stroke="#38bdf8"
              strokeWidth="1.5"
            />
            {/* Current Ply Head Dot */}
            <circle
              cx={currentPly}
              cy={
                evalHistory.get(currentPly)
                  ? 50 - (clampEvalForChart(evalHistory.get(currentPly)!.scoreCp, 1500) / 1500) * 45
                  : 50
              }
              r="2.5"
              fill="#38bdf8"
              stroke="#0f172a"
              strokeWidth="1"
            />
          </svg>
        </div>
      </div>
    </div>
  );
};
