/**
 * Active Recall SRS Drill Panel Component.
 * Interactive Shogi board drill where the user plays memorized repertoire moves,
 * receiving immediate feedback (correct advancement vs rejection cues on mistakes),
 * with visual board hints (rank areas, file bands, candidate piece glows, and answer arrows),
 * automated opponent responses, and performance statistics.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DrillState, useSrsDrill } from '../../hooks/useSrsDrill';
import { mockTree } from '../../mock/mockData';
import { Color } from '../../types/shogi';
import { SRSReviewCard } from '../../types/srs';
import { KifuTreeNode, MergedKifuTree } from '../../types/tree';
import {
  calculateSrsSummary,
  extractSrsCardsFromTree,
  getDueCards,
  loadSrsCards,
} from '../../utils/srsStorage';
import { formatShogiMove } from '../../utils/shogiRules';
import { ShogiBoardPanel } from '../board/ShogiBoardPanel';
import { DailyReviewDashboard } from './DailyReviewDashboard';
import { SelectiveHintsPanel } from './SelectiveHintsPanel';

export interface SrsDrillPanelProps {
  openingTree?: MergedKifuTree | null;
  className?: string;
  defaultDrillState?: DrillState;
  initialStartPly?: number;
  initialSide?: Color;
  initialPath?: KifuTreeNode[];
  onExitDrill?: () => void;
}

export const SrsDrillPanel: React.FC<SrsDrillPanelProps> = ({
  openingTree,
  className = '',
  defaultDrillState,
  initialStartPly = 0,
  initialSide = 'b',
  initialPath,
  onExitDrill,
}) => {
  const { t } = useTranslation();
  const [selectedSide, setSelectedSide] = useState<Color>(initialSide);
  const [selectedStartPly, setSelectedStartPly] = useState<number>(initialStartPly);
  const [isFlipped, setIsFlipped] = useState<boolean>(initialSide === 'w');

  // Fallback to sample repertoire tree (mockTree) if no repertoire has been uploaded yet
  const effectiveTree = useMemo(() => {
    if (openingTree && openingTree.rootNodes && openingTree.rootNodes.length > 0) {
      return openingTree;
    }
    return mockTree;
  }, [openingTree]);

  // SM-2 Spaced Repetition card collection & summary
  const [dashboardSide, setDashboardSide] = useState<Color | 'both'>('both');
  const [storedCards, setStoredCards] = useState<SRSReviewCard[]>(() => loadSrsCards());

  const currentRepertoireCards = useMemo(() => {
    return extractSrsCardsFromTree({
      tree: effectiveTree,
      targetSide: dashboardSide,
      openingId: effectiveTree.openingId || 'general',
      existingCards: storedCards,
    });
  }, [dashboardSide, effectiveTree, storedCards]);

  const srsSummary = useMemo(() => {
    return calculateSrsSummary(currentRepertoireCards);
  }, [currentRepertoireCards]);

  const dueCards = useMemo(() => {
    return getDueCards(currentRepertoireCards);
  }, [currentRepertoireCards]);

  const drill = useSrsDrill({
    initialTree: effectiveTree,
    defaultSide: selectedSide,
    defaultDrillState,
    defaultStartPly: selectedStartPly,
    initialPath,
  });

  // Re-read storage upon session completion
  useEffect(() => {
    if (drill.drillState === 'completed') {
      setStoredCards(loadSrsCards());
    }
  }, [drill.drillState]);

  const isUserSente = drill.userColor === 'b';
  const senteLabel = isUserSente
    ? `▲ ${t('board.sente')} (${t('srs.side_sente')})`
    : `▲ ${t('board.sente')} (CPU)`;
  const goteLabel = !isUserSente
    ? `△ ${t('board.gote')} (${t('srs.side_gote')})`
    : `△ ${t('board.gote')} (CPU)`;

  const handleStart = () => {
    drill.startDrill({
      side: selectedSide,
      startPly: selectedStartPly,
      path: initialPath,
    });
    if (selectedSide === 'w') {
      setIsFlipped(true);
    } else {
      setIsFlipped(false);
    }
  };

  const handleStartDailyReview = () => {
    const targetList = dueCards.length > 0 ? dueCards : currentRepertoireCards;
    drill.startDailyReview(targetList);
    if (targetList[0]?.correctMove.color === 'w') {
      setIsFlipped(true);
    } else {
      setIsFlipped(false);
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* SM-2 Daily Review Dashboard (always visible in setup mode) */}
      {drill.drillState === 'setup' && (
        <DailyReviewDashboard
          cards={currentRepertoireCards}
          summary={srsSummary}
          dueCards={dueCards}
          selectedSide={dashboardSide}
          onSelectSide={setDashboardSide}
          onStartDailyReview={handleStartDailyReview}
          onStartTreeDrill={handleStart}
        />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Board & Active Drill Column */}
        <div className="flex flex-col gap-4 lg:col-span-7 xl:col-span-8">
          {/* Setup Configuration Banner OR Dynamic Drill Feedback Banner */}
          {drill.drillState === 'setup' ? (
            <div className="rounded-xl border border-indigo-500/40 bg-gradient-to-r from-indigo-950/30 via-slate-900 to-indigo-950/20 p-4 shadow-lg space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">🎯</span>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      {t('srs.setup_title')}: {effectiveTree.openingName || t('app.sample_opening')}
                    </h3>
                    <p className="text-xs text-slate-400">
                      {t('srs.drill_subtitle')}
                    </p>
                  </div>
                </div>

                {onExitDrill && (
                  <button
                    type="button"
                    onClick={onExitDrill}
                    className="rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 px-3 py-1.5 text-xs text-slate-300 transition flex items-center gap-1.5"
                  >
                    <span>🚪</span>
                    <span>{t('srs.exit_drill')}</span>
                  </button>
                )}
              </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Side Selection */}
              <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
                <span className="text-[11px] font-semibold text-slate-400 block mb-1.5">
                  {t('srs.drill_side_label')}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSide('b');
                      setIsFlipped(false);
                    }}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 border ${
                      selectedSide === 'b'
                        ? 'border-amber-500 bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30'
                        : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <span>▲</span>
                    <span>{t('board.sente')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSide('w');
                      setIsFlipped(true);
                    }}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 border ${
                      selectedSide === 'w'
                        ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/30'
                        : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <span>△</span>
                    <span>{t('board.gote')}</span>
                  </button>
                </div>
              </div>

              {/* Starting Ply Selection */}
              <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
                <span className="text-[11px] font-semibold text-slate-400 block mb-1.5">
                  {t('srs.drill_scope_label')}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedStartPly(0)}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition border ${
                      selectedStartPly === 0
                        ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30'
                        : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    {t('srs.start_drill_from_initial')}
                  </button>
                  {initialStartPly > 0 ? (
                    <button
                      type="button"
                      onClick={() => setSelectedStartPly(initialStartPly)}
                      className={`py-2 px-3 rounded-lg text-xs font-bold transition border ${
                        selectedStartPly === initialStartPly
                          ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30'
                          : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      {t('srs.start_from_midgame', { ply: initialStartPly })}
                    </button>
                  ) : (
                    <div className="text-[11px] text-slate-500 flex items-center justify-center font-mono">
                      (0手目〜)
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Start Drill Action Button */}
            <button
              type="button"
              onClick={handleStart}
              className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-amber-950/40 hover:from-amber-400 hover:to-amber-500 active:scale-[0.98] transition flex items-center justify-center gap-2"
            >
              <span className="text-lg">🚀</span>
              <span>{t('srs.start_drill')}</span>
            </button>
          </div>
        ) : (
          <div
            className={`rounded-xl border p-3.5 transition-all duration-300 shadow-md ${
              drill.feedback.status === 'correct'
                ? 'border-emerald-500/60 bg-emerald-950/30 ring-1 ring-emerald-500/40'
                : drill.feedback.status === 'mistake'
                ? 'border-rose-500/60 bg-rose-950/30 ring-1 ring-rose-500/40 animate-shake'
                : drill.drillState === 'completed'
                ? 'border-amber-500/60 bg-amber-950/30'
                : 'border-slate-800 bg-slate-900/80'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">
                  {drill.feedback.status === 'correct'
                    ? '⭕'
                    : drill.feedback.status === 'mistake'
                    ? '❌'
                    : drill.drillState === 'opponent_thinking'
                    ? '🤖'
                    : drill.drillState === 'completed'
                    ? '🏆'
                    : '🧠'}
                </span>

                <div>
                  <span
                    className={`text-xs font-bold ${
                      drill.feedback.status === 'correct'
                        ? 'text-emerald-400'
                        : drill.feedback.status === 'mistake'
                        ? 'text-rose-400'
                        : drill.drillState === 'opponent_thinking'
                        ? 'text-sky-400'
                        : drill.drillState === 'completed'
                        ? 'text-amber-400'
                        : 'text-slate-200'
                    }`}
                  >
                    {drill.feedback.status === 'correct'
                      ? t('srs.feedback_correct')
                      : drill.feedback.status === 'mistake'
                      ? t('srs.feedback_incorrect')
                      : drill.drillState === 'opponent_thinking'
                      ? t('srs.feedback_opponent_thinking')
                      : drill.drillState === 'completed'
                      ? t('srs.completed_title')
                      : t('srs.feedback_user_turn', {
                          side: drill.userColor === 'b' ? t('board.sente') : t('board.gote'),
                        })}
                  </span>

                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {drill.drillState === 'completed'
                      ? t('srs.completed_desc')
                      : t('srs.current_ply_header', {
                          ply: drill.currentPly,
                          opening: effectiveTree.openingName || t('app.sample_opening'),
                        })}
                  </p>
                </div>
              </div>

              {/* Drill Score / Accuracy Indicators */}
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="rounded bg-emerald-950/60 border border-emerald-500/40 px-2 py-0.5 text-emerald-300">
                  ✓ {drill.stats.correctCount}
                </span>
                <span className="rounded bg-rose-950/60 border border-rose-500/40 px-2 py-0.5 text-rose-300">
                  ✕ {drill.stats.mistakeCount}
                </span>
                <span className="rounded bg-amber-950/60 border border-amber-500/40 px-2 py-0.5 text-amber-300 font-bold">
                  {drill.stats.accuracyPct}%
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Shogi Board Container */}
        <div className="rounded-xl border border-shogi-border bg-shogi-panel p-4 shadow-lg flex flex-col items-center relative">
          {/* Promotion Confirmation Modal */}
          {drill.pendingPromotion && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/80 rounded-xl backdrop-blur-sm p-4">
              <div className="rounded-xl border border-amber-500/60 bg-slate-900 p-5 shadow-2xl max-w-xs w-full text-center">
                <span className="text-3xl mb-2 block">✨</span>
                <h3 className="text-sm font-bold text-slate-100 mb-1">
                  {t('sparring.promote_prompt')}
                </h3>
                <div className="flex gap-3 justify-center mt-4">
                  <button
                    type="button"
                    onClick={() => drill.confirmPromotion(true)}
                    className="flex-1 rounded-lg bg-red-600 hover:bg-red-500 px-4 py-2 text-xs font-bold text-white shadow transition"
                  >
                    {t('sparring.promote_yes')}
                  </button>
                  <button
                    type="button"
                    onClick={() => drill.confirmPromotion(false)}
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 transition"
                  >
                    {t('sparring.promote_no')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Completed Result Overlay */}
          {drill.drillState === 'completed' && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/85 rounded-xl backdrop-blur-md p-4 animate-fadeIn">
              <div className="rounded-2xl border border-amber-500/50 bg-slate-900 p-6 shadow-2xl max-w-sm w-full text-center space-y-4">
                <span className="text-4xl block">🏆</span>
                <h3 className="text-base font-bold text-white">
                  {t('srs.completed_title')}
                </h3>
                <p className="text-xs text-slate-400">
                  {t('srs.completed_desc')}
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 py-2 font-mono text-xs">
                  <div className="rounded-lg bg-slate-950/80 border border-slate-800 p-2">
                    <span className="text-slate-500 block text-[10px]">
                      {t('srs.stat_correct_label')}
                    </span>
                    <span className="text-emerald-400 font-bold text-sm block mt-0.5">
                      {drill.stats.correctCount}
                    </span>
                  </div>
                  <div className="rounded-lg bg-slate-950/80 border border-slate-800 p-2">
                    <span className="text-slate-500 block text-[10px]">
                      {t('srs.stat_mistake_label')}
                    </span>
                    <span className="text-rose-400 font-bold text-sm block mt-0.5">
                      {drill.stats.mistakeCount}
                    </span>
                  </div>
                  <div className="rounded-lg bg-slate-950/80 border border-slate-800 p-2">
                    <span className="text-slate-500 block text-[10px]">
                      {t('srs.stat_hints_label')}
                    </span>
                    <span className="text-purple-400 font-bold text-sm block mt-0.5">
                      {drill.stats.hintsUsedCount}
                      {drill.stats.hintPenaltyScore > 0 && (
                        <span className="text-[10px] text-purple-300/80 ml-0.5">
                          (+{drill.stats.hintPenaltyScore}pt)
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="rounded-lg bg-slate-950/80 border border-slate-800 p-2">
                    <span className="text-slate-500 block text-[10px]">
                      {t('srs.stat_accuracy_label')}
                    </span>
                    <span className="text-amber-400 font-bold text-sm block mt-0.5">
                      {drill.stats.accuracyPct}%
                    </span>
                  </div>
                </div>

                {/* SM-2 Scheduled Cards Result List */}
                {drill.drillMode === 'daily_review' && drill.reviewedCardsResult.length > 0 && (
                  <div className="rounded-lg bg-slate-950/70 border border-slate-800 p-2.5 text-left max-h-36 overflow-y-auto space-y-1 font-mono text-[11px]">
                    <span className="text-[10px] text-amber-400 font-bold block mb-1">
                      📅 {t('srs.sm2_session_summary_title')} ({drill.reviewedCardsResult.length} 局面)
                    </span>
                    {drill.reviewedCardsResult.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between py-0.5 border-b border-slate-800/40 last:border-0"
                      >
                        <span className="text-slate-200">
                          {c.correctMove.kifString}
                        </span>
                        <span className="text-purple-300">
                          次回: {c.dueDate} (+{c.intervalDays}日)
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={drill.resetDrill}
                    className="flex-1 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 py-2.5 text-xs font-semibold text-slate-300 transition"
                  >
                    {t('srs.action_change_setup')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      drill.startDrill({
                        side: drill.userColor,
                        startPly: drill.startPly,
                        path: initialPath,
                      })
                    }
                    className="flex-1 rounded-xl bg-amber-600 hover:bg-amber-500 py-2.5 text-xs font-bold text-slate-950 shadow transition"
                  >
                    🔄 {t('srs.action_restart')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ShogiBoardPanel with piece stands & visual hints */}
          <ShogiBoardPanel
            board={drill.board}
            currentPly={drill.currentPly}
            totalPly={drill.moveHistory.length}
            currentMove={drill.currentMove}
            isFlipped={isFlipped}
            senteName={senteLabel}
            goteName={goteLabel}
            onFirstPly={() => {}}
            onPrevPly={() => {}}
            onNextPly={() => {}}
            onLastPly={() => {}}
            onFlipToggle={() => setIsFlipped((prev) => !prev)}
            selectedSquare={drill.selectedSquare}
            selectedHandPiece={drill.selectedHandPiece}
            targetSquares={drill.validTargetSquares}
            hintSquares={drill.hintSquares}
            hintRankSquares={drill.hintRankSquares}
            hintFileSquares={drill.hintFileSquares}
            hintPieceSquares={drill.hintPieceSquares}
            hintHandPiece={drill.hintHandPiece}
            isHintKomadai={drill.isHintKomadai}
            hintArrow={drill.hintArrow}
            onSquareClick={
              drill.drillState === 'user_turn' ? drill.handleSquareClick : undefined
            }
            onHandPieceSelect={
              drill.drillState === 'user_turn' ? drill.handleHandPieceSelect : undefined
            }
            hideController={true}
          />

          {/* Drill Session Control Bar */}
          <div className="mt-4 pt-3 border-t border-shogi-border/60 w-full flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsFlipped((prev) => !prev)}
                className="rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs text-slate-300 hover:text-white transition"
              >
                ⟲ {t('board.flip')}
              </button>
            </div>

            <div className="flex items-center gap-2">
              {drill.drillState !== 'setup' && (
                <button
                  type="button"
                  onClick={drill.resetDrill}
                  className="rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1 text-xs text-slate-400 hover:text-slate-200 transition"
                >
                  ⚙️ {t('srs.action_change_setup')}
                </button>
              )}

              {onExitDrill && (
                <button
                  type="button"
                  onClick={onExitDrill}
                  className="rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1 text-xs text-slate-400 hover:text-slate-200 transition"
                >
                  🚪 {t('srs.exit_drill')}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 5-Type Selective Hints Panel */}
        {drill.drillState !== 'setup' ? (
          <SelectiveHintsPanel
            expectedMove={drill.primaryExpectedMove}
            revealedHints={drill.revealedHints}
            onRevealHint={drill.revealHint}
            hintsUsedCount={drill.stats?.hintsUsedCount ?? 0}
            hintPenaltyScore={drill.stats?.hintPenaltyScore ?? 0}
            isInteractive={drill.drillState === 'user_turn'}
          />
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 text-center text-xs text-slate-400">
            💡 {t('srs.hints_panel_desc')}
          </div>
        )}
      </div>

      {/* Side Column: Move History & Progress */}
      <div className="flex flex-col gap-4 lg:col-span-5 xl:col-span-4">
        <div className="rounded-xl border border-shogi-border bg-shogi-panel p-4 shadow-lg flex-1 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-shogi-border/60">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-500">
              📋 {t('srs.moves_history')}
            </h3>
            <span className="text-xs font-mono text-slate-400">
              {drill.moveHistory.length} moves
            </span>
          </div>

          <div className="mt-3 flex-1 max-h-[460px] overflow-y-auto space-y-1 pr-1 font-mono text-xs">
            {drill.moveHistory.length === 0 ? (
              <p className="text-slate-500 text-[11px] py-8 text-center">
                {t('sparring.no_moves_yet')}
              </p>
            ) : (
              drill.moveHistory.map((m, idx) => {
                const prevDest = idx > 0 ? drill.moveHistory[idx - 1]?.to : undefined;
                const isUserMove = m.color === drill.userColor;

                return (
                  <div
                    key={`srs-move-${m.ply}`}
                    className={`flex items-center justify-between px-2.5 py-1 rounded transition ${
                      m.ply === drill.moveHistory.length
                        ? 'bg-amber-500/20 text-amber-300 font-bold'
                        : isUserMove
                        ? 'bg-emerald-950/30 text-emerald-300'
                        : 'bg-slate-900/40 text-slate-300'
                    }`}
                  >
                    <span className="w-8 text-slate-500">{m.ply}.</span>
                    <span className="flex-1 font-sans font-medium">
                      {formatShogiMove(m, prevDest)}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {m.sfenMove}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  </div>
);
};
