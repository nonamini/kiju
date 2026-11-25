/**
 * Pro Broadcast Layout Component for Mock Page.
 * Responsive single-screen design fitting desktop & mobile.
 * Gracefully handles missing KIF headers, optional comments, or unanalyzed evaluations.
 * Features clean player badges without double ▲/△ and tabs to switch between Analysis & Move History.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ShogiBoard } from '../utils/shogiBoard';
import { ShogiBoardView } from '../components/board/ShogiBoardView';
import { Color, ShogiMove } from '../types/shogi';
import { KifuTreeNode } from '../types/tree';

export interface ProBroadcastLayoutProps {
  board: ShogiBoard;
  currentPly: number;
  totalPly: number;
  currentMove?: ShogiMove;
  isFlipped: boolean;
  onFlipToggle: () => void;
  activePath: KifuTreeNode[];
  onSelectPly: (ply: number) => void;
  // Optional KIF metadata
  matchTitle?: string;
  sentePlayerName?: string;
  gotePlayerName?: string;
  commentaryText?: string;
}

export const ProBroadcastLayout: React.FC<ProBroadcastLayoutProps> = ({
  board,
  currentPly,
  totalPly,
  currentMove,
  isFlipped,
  onFlipToggle,
  activePath,
  onSelectPly,
  matchTitle,
  sentePlayerName,
  gotePlayerName,
  commentaryText,
}) => {
  const { t } = useTranslation();

  // Tab state for right panel: 'telemetry' (Evaluation & AI candidates) vs 'history' (Move list)
  const [rightPanelTab, setRightPanelTab] = useState<'telemetry' | 'history'>('telemetry');

  // Fallback-safe clean player & match titles (ensures no leading ▲/△ in name string)
  const cleanName = (rawName?: string): string => {
    if (!rawName) return '';
    return rawName.replace(/^[▲△\s]+/, '').trim();
  };

  const safeTitle = matchTitle || t('mock.broadcast.match_title') || t('mock.broadcast.unnamed_game');
  const safeSente = cleanName(sentePlayerName) || t('mock.broadcast.sente_label');
  const safeGote = cleanName(gotePlayerName) || t('mock.broadcast.gote_label');

  // Turn detection
  const turn: Color = typeof board?.getTurn === 'function' ? board.getTurn() : 'b';
  const isSenteTurn = turn === 'b';

  // Hands from board
  const senteHand = useMemo(() => (typeof board?.getHand === 'function' ? board.getHand('b') : {}), [board]);
  const goteHand = useMemo(() => (typeof board?.getHand === 'function' ? board.getHand('w') : {}), [board]);

  // Current node evaluation or undefined if unanalyzed
  const currentNode = activePath[currentPly];
  const evalData = currentNode?.move.evaluation;
  const hasEvaluation = Boolean(evalData && typeof evalData.scoreCp === 'number');
  const evalScore = evalData?.scoreCp ?? (currentPly % 2 === 1 ? 217 : -180);

  // Winning percentages based on sigmoid formula: winPct = 1 / (1 + 10^(-score / 1200))
  const senteWinPct = useMemo(() => {
    if (!hasEvaluation && evalScore === 0) return 50;
    const p = Math.round((1 / (1 + Math.pow(10, -evalScore / 1200))) * 100);
    return Math.max(1, Math.min(99, p));
  }, [evalScore, hasEvaluation]);
  const goteWinPct = 100 - senteWinPct;

  // Formatted eval score text
  const evalScoreText = useMemo(() => {
    if (!hasEvaluation) return t('mock.broadcast.eval_unavailable');
    if (Math.abs(evalScore) < 50) return `${t('mock.broadcast.eval_even')} (${evalScore > 0 ? '+' : ''}${evalScore})`;
    if (evalScore >= 800) return `${t('mock.broadcast.eval_sente_winning')} (+${evalScore})`;
    if (evalScore >= 200) return `${t('mock.broadcast.eval_sente_advantage')} (+${evalScore})`;
    if (evalScore <= -800) return `${t('mock.broadcast.eval_gote_winning')} (${evalScore})`;
    return `${t('mock.broadcast.eval_gote_advantage')} (${evalScore})`;
  }, [evalScore, hasEvaluation, t]);

  // Candidate move recommendations (Multi-PV Mock or actual tree children)
  const candidateMoves = useMemo(() => {
    if (currentNode && currentNode.children.length > 0) {
      return currentNode.children.slice(0, 4).map((child, idx) => ({
        rank: idx + 1,
        moveStr: child.move.kifString || child.move.sfenMove,
        sfen: child.move.sfenMove,
        evalCp: child.evaluation?.scoreCp ?? evalScore - idx * 40,
        pv: child.evaluation?.pv ? child.evaluation.pv.join(' ') : child.move.sfenMove,
        rate: Math.max(5, Math.round((child.gameCount / (currentNode.gameCount || 1)) * 100)),
      }));
    }
    return [
      { rank: 1, moveStr: '△２四歩', sfen: '2c2d', evalCp: evalScore, pv: '▲同飛 △２三歩 ▲２八飛', rate: 56.1 },
      { rank: 2, moveStr: '△３四歩', sfen: '3c3d', evalCp: evalScore - 45, pv: '▲２四歩 △同歩 ▲同飛', rate: 21.4 },
      { rank: 3, moveStr: '△１四歩', sfen: '1c1d', evalCp: evalScore - 95, pv: '▲１六歩 △３四歩', rate: 12.3 },
      { rank: 4, moveStr: '△６二玉', sfen: '5a6b', evalCp: evalScore - 140, pv: '▲２四歩 △同歩', rate: 6.2 },
    ];
  }, [currentNode, evalScore]);

  // Safe commentary
  const activeCommentary = commentaryText || currentNode?.comment || t('mock.broadcast.no_commentary');

  // Render hand piece badges
  const renderHandPieces = (hand: Record<string, number>, isMobileHorizontal = false) => {
    const kanjiMap: Record<string, string> = { R: '飛', B: '角', G: '金', S: '銀', N: '桂', L: '香', P: '歩' };
    const pieces = ['R', 'B', 'G', 'S', 'N', 'L', 'P'].filter((p) => (hand[p] ?? 0) > 0);

    if (pieces.length === 0) {
      return <span className="text-[10px] text-slate-500 font-mono py-1">なし</span>;
    }

    return (
      <div className={`flex ${isMobileHorizontal ? 'flex-row flex-wrap gap-1' : 'flex-col gap-1 w-full items-center'}`}>
        {pieces.map((pKey) => {
          const count = hand[pKey] ?? 0;
          return (
            <div
              key={pKey}
              className={`rounded border border-amber-950/60 bg-gradient-to-b from-[#e8c688] to-[#c79c5e] text-slate-900 font-bold flex flex-col items-center justify-center relative shadow-sm ${
                isMobileHorizontal ? 'w-8 h-7 text-[11px]' : 'w-10 h-8 text-xs'
              }`}
            >
              <span className="leading-none">{kanjiMap[pKey]}</span>
              {count > 1 && (
                <span className="absolute -top-1 -right-1 bg-rose-600 text-white font-mono text-[9px] w-3.5 h-3.5 rounded-full flex items-center justify-center font-bold ring-1 ring-white/50">
                  {count}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2 w-full max-w-[1240px] mx-auto select-none font-sans text-slate-100">
      {/* 1. TOP HEADER: Dual-Color Win Rate & Match Banner Bar */}
      <div className="rounded-lg border border-slate-700 bg-slate-950/90 shadow-md overflow-hidden backdrop-blur-md">
        <div className="flex items-center justify-between px-3 py-1 border-b border-slate-800 bg-slate-900/60 text-xs">
          <div className="flex items-center gap-2 truncate">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
            </span>
            <span className="text-[10px] font-bold tracking-wider text-rose-400 uppercase">LIVE</span>
            <span className="font-semibold text-slate-300 truncate">
              {safeTitle}
            </span>
            <span className="text-slate-500 font-mono text-[11px]">
              第{currentPly}手目
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onFlipToggle}
              className="text-[11px] px-2 py-0.5 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center gap-1"
            >
              <span>⟲</span>
              <span>{t('board.flip')}</span>
            </button>
          </div>
        </div>

        {/* Win Rate Split Gauge Bar */}
        <div className="relative h-7 w-full flex items-center bg-slate-900 text-xs">
          {/* Gote (White) */}
          <div
            className="h-full bg-gradient-to-r from-sky-900 via-sky-700 to-sky-600 flex items-center px-3 transition-all duration-500 justify-start"
            style={{ width: `${goteWinPct}%` }}
          >
            <div className="flex items-center gap-1.5 text-white drop-shadow font-bold text-[11px] truncate">
              <span className="text-sky-200 truncate">△ {safeGote}</span>
              <span className="font-mono">{goteWinPct}%</span>
            </div>
          </div>

          {/* Sente (Black) */}
          <div
            className="h-full bg-gradient-to-l from-amber-700 via-amber-600 to-amber-500 flex items-center px-3 transition-all duration-500 justify-end"
            style={{ width: `${senteWinPct}%` }}
          >
            <div className="flex items-center gap-1.5 text-white drop-shadow font-bold text-[11px] truncate">
              <span className="font-mono">{senteWinPct}%</span>
              <span className="text-amber-200 truncate">▲ {safeSente}</span>
            </div>
          </div>

          {/* Central Split Line */}
          <div className="absolute left-1/2 top-0 bottom-0 w-[2px] bg-white/40 -translate-x-1/2 shadow-lg" />
        </div>
      </div>

      {/* 2. MAIN BATTLE ARENA */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-start">
        {/* LEFT COLUMN: Shogi Board (PC: flanked vertical stands, Mobile: stacked horizontal stands) */}
        <div className="lg:col-span-7 xl:col-span-7 rounded-xl border border-slate-800 bg-slate-950/80 p-2.5 shadow-xl flex flex-col items-center">
          {/* MOBILE ONLY: Gote Top Horizontal Komadai */}
          <div className="w-full lg:hidden flex items-center justify-between px-2.5 py-1 mb-1.5 rounded-lg border border-slate-800 bg-slate-900/90">
            <span className="text-xs font-bold text-sky-300">
              △ {safeGote}
            </span>
            <div className="flex items-center gap-1">
              {renderHandPieces(isFlipped ? senteHand : goteHand, true)}
            </div>
          </div>

          {/* Board Center Container */}
          <div className="flex flex-row items-center justify-center gap-2 w-full">
            {/* DESKTOP ONLY: Left Vertical Stand (Gote if normal, Sente if flipped) */}
            <div className="hidden lg:flex w-14 min-h-[340px] flex-col items-center py-2 px-1 rounded-lg border border-slate-800 bg-slate-900/90 shadow-md">
              <div className="text-[11px] font-bold text-sky-300 writing-vertical mb-2 tracking-wider">
                △ {safeGote}
              </div>
              {renderHandPieces(isFlipped ? senteHand : goteHand)}
            </div>

            {/* SVG Shogi Board */}
            <div className="flex-1 w-full max-w-[360px] sm:max-w-[400px] flex items-center justify-center bg-slate-950 rounded-lg overflow-hidden border border-amber-950/40 shadow-inner p-1">
              <ShogiBoardView
                board={board}
                isFlipped={isFlipped}
                lastMove={currentMove}
                className="w-full h-auto"
              />
            </div>

            {/* DESKTOP ONLY: Right Vertical Stand (Sente if normal, Gote if flipped) */}
            <div className="hidden lg:flex w-14 min-h-[340px] flex-col items-center py-2 px-1 rounded-lg border border-slate-800 bg-slate-900/90 shadow-md">
              <div className="text-[11px] font-bold text-amber-300 writing-vertical mb-2 tracking-wider">
                ▲ {safeSente}
              </div>
              {renderHandPieces(isFlipped ? goteHand : senteHand)}
            </div>
          </div>

          {/* MOBILE ONLY: Sente Bottom Horizontal Komadai */}
          <div className="w-full lg:hidden flex items-center justify-between px-2.5 py-1 mt-1.5 rounded-lg border border-slate-800 bg-slate-900/90">
            <span className="text-xs font-bold text-amber-300">
              ▲ {safeSente}
            </span>
            <div className="flex items-center gap-1">
              {renderHandPieces(isFlipped ? goteHand : senteHand, true)}
            </div>
          </div>

          {/* Compact Board Navigation Stepper */}
          <div className="flex items-center justify-between w-full mt-2 pt-2 border-t border-slate-800/80 text-xs text-slate-400">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSelectPly(0)}
                disabled={currentPly === 0}
                className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-30"
              >
                |◀
              </button>
              <button
                type="button"
                onClick={() => onSelectPly(Math.max(0, currentPly - 1))}
                disabled={currentPly === 0}
                className="px-2.5 py-0.5 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-30"
              >
                ◀
              </button>
              <button
                type="button"
                onClick={() => onSelectPly(Math.min(totalPly, currentPly + 1))}
                disabled={currentPly >= totalPly}
                className="px-2.5 py-0.5 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-30"
              >
                ▶
              </button>
              <button
                type="button"
                onClick={() => onSelectPly(totalPly)}
                disabled={currentPly >= totalPly}
                className="px-2.5 py-0.5 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-30"
              >
                ▶|
              </button>
            </div>

            <div className="font-mono text-slate-300 text-xs">
              <span className="text-amber-400 font-bold">{currentPly}</span> / {totalPly} 手
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Broadcast Telemetry Dashboard with Switchable Tabs */}
        <div className="lg:col-span-5 xl:col-span-5 flex flex-col gap-2">
          {/* Sub-Tab Navigation (Analysis & Candidates vs Move History) */}
          <div className="flex items-center rounded-lg bg-slate-900 p-0.5 border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setRightPanelTab('telemetry')}
              className={`flex-1 py-1 px-2.5 rounded-md font-bold transition flex items-center justify-center gap-1.5 ${
                rightPanelTab === 'telemetry'
                  ? 'bg-amber-600 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>📊</span>
              <span>{t('mock.broadcast.tab_telemetry')}</span>
            </button>
            <button
              type="button"
              onClick={() => setRightPanelTab('history')}
              className={`flex-1 py-1 px-2.5 rounded-md font-bold transition flex items-center justify-center gap-1.5 ${
                rightPanelTab === 'history'
                  ? 'bg-amber-600 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>📜</span>
              <span>{t('mock.broadcast.tab_history')}</span>
              <span className="font-mono text-[10px] opacity-75">({totalPly})</span>
            </button>
          </div>

          {/* VIEW A: Analysis & AI Candidates */}
          {rightPanelTab === 'telemetry' && (
            <>
              {/* 1. Evaluation Score & Best Move Card */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3 shadow-md flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-extrabold text-white">
                    {evalScoreText}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                    {hasEvaluation ? `depth=${evalData?.depth ?? 14}` : t('mock.broadcast.eval_unavailable_sub')}
                  </span>
                </div>

                {/* Best Move Spotlight */}
                <div className="rounded-lg bg-gradient-to-r from-amber-950/30 via-slate-900 to-slate-900 p-2 border border-amber-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 text-[10px] font-bold">
                      {t('mock.broadcast.best_move_label')}
                    </span>
                    <span className="text-base font-black text-amber-300 font-mono">
                      {candidateMoves[0]?.moveStr || '-'}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {candidateMoves.length > 0 ? `候補 1/${candidateMoves.length}` : ''}
                  </span>
                </div>
              </div>

              {/* 2. Clean Player Turn Badges (Single ▲/△ symbol, no redundant "待機中") */}
              <div className="grid grid-cols-2 gap-2">
                {/* Gote Box */}
                <div
                  className={`rounded-lg border px-3 py-2 flex items-center justify-between transition-all ${
                    !isSenteTurn
                      ? 'border-sky-500 bg-gradient-to-r from-sky-950/70 to-slate-900 ring-1 ring-sky-500/40 shadow-sm'
                      : 'border-slate-800/90 bg-slate-950/50 opacity-60'
                  }`}
                >
                  <span className="text-xs font-bold text-sky-300 truncate">
                    △ {safeGote}
                  </span>
                  {!isSenteTurn && (
                    <span className="rounded bg-sky-500 text-slate-950 text-[10px] font-black px-2 py-0.5 animate-pulse shrink-0">
                      {t('mock.broadcast.turn_badge')}
                    </span>
                  )}
                </div>

                {/* Sente Box */}
                <div
                  className={`rounded-lg border px-3 py-2 flex items-center justify-between transition-all ${
                    isSenteTurn
                      ? 'border-amber-500 bg-gradient-to-r from-amber-950/70 to-slate-900 ring-1 ring-amber-500/40 shadow-sm'
                      : 'border-slate-800/90 bg-slate-950/50 opacity-60'
                  }`}
                >
                  <span className="text-xs font-bold text-amber-300 truncate">
                    ▲ {safeSente}
                  </span>
                  {isSenteTurn && (
                    <span className="rounded bg-amber-500 text-slate-950 text-[10px] font-black px-2 py-0.5 animate-pulse shrink-0">
                      {t('mock.broadcast.turn_badge')}
                    </span>
                  )}
                </div>
              </div>

              {/* 3. Strategic Commentary & Book Note Box */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-2.5 shadow-md flex flex-col gap-1.5">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5 text-xs font-bold text-slate-300">
                  <span className="flex items-center gap-1">
                    <span>🎙️</span>
                    <span>{t('mock.broadcast.commentary_title')}</span>
                  </span>
                  <span className="text-[10px] text-emerald-400 bg-emerald-950/80 px-1.5 py-0.2 rounded border border-emerald-500/40">
                    定跡
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-slate-300 max-h-[70px] overflow-y-auto">
                  {activeCommentary}
                </p>
              </div>

              {/* 4. Compact Candidate Lines (Multi-PV) */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-2.5 shadow-md flex flex-col gap-1.5">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-1 text-xs font-bold text-amber-400">
                  <span className="flex items-center gap-1">
                    <span>📊</span>
                    <span>{t('mock.broadcast.multi_pv_title')}</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    Top {candidateMoves.length}
                  </span>
                </div>

                <div className="flex flex-col gap-1.5 max-h-[140px] overflow-y-auto pr-0.5">
                  {candidateMoves.map((cand) => (
                    <div
                      key={cand.rank}
                      className={`rounded p-1.5 transition flex items-center justify-between text-xs border ${
                        cand.rank === 1
                          ? 'border-amber-500/50 bg-amber-950/30'
                          : 'border-slate-800/80 bg-slate-900/60'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="text-[10px] font-bold px-1 rounded bg-slate-800 text-slate-300 font-mono">
                          {cand.rank}
                        </span>
                        <span className="font-bold text-white font-mono">
                          {cand.moveStr}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono truncate hidden sm:inline">
                          {cand.pv}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 font-mono shrink-0">
                        <span className="text-[10px] text-slate-400 font-bold">{cand.rate}%</span>
                        <span className={`text-[11px] font-bold ${cand.evalCp >= 0 ? 'text-amber-400' : 'text-sky-400'}`}>
                          {cand.evalCp > 0 ? '+' : ''}{cand.evalCp}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* VIEW B: Move History (指し手履歴 - Click to jump ply) */}
          {rightPanelTab === 'history' && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3 shadow-md flex flex-col gap-2 flex-1">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs">
                <span className="font-bold text-slate-300 flex items-center gap-1.5">
                  <span>📋</span>
                  <span>{t('mock.broadcast.tab_history')}</span>
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  {currentPly} / {totalPly} 手目
                </span>
              </div>

              {/* Move list table */}
              <div className="max-h-[340px] overflow-y-auto space-y-1 font-mono text-xs pr-1">
                {activePath.length <= 1 ? (
                  <p className="text-slate-500 text-xs py-4 text-center">
                    初期局面です
                  </p>
                ) : (
                  activePath.slice(1).map((node, idx) => {
                    const ply = idx + 1;
                    const isSelected = ply === currentPly;
                    const isSenteMove = node.move.color === 'b';
                    const moveEvaluation = node.move.evaluation;

                    return (
                      <button
                        key={node.id || `move-${ply}`}
                        type="button"
                        onClick={() => onSelectPly(ply)}
                        className={`w-full flex items-center justify-between px-2.5 py-1 rounded transition text-left ${
                          isSelected
                            ? 'bg-amber-600/30 text-amber-200 border border-amber-500/60 font-bold'
                            : 'hover:bg-slate-900 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 w-6 text-right">{ply}.</span>
                          <span className={isSenteMove ? 'text-amber-300' : 'text-sky-300'}>
                            {node.move.kifString || node.move.sfenMove}
                          </span>
                        </div>

                        {moveEvaluation && (
                          <span
                            className={`text-[10px] font-mono ${
                              moveEvaluation.scoreCp >= 0 ? 'text-amber-400' : 'text-sky-400'
                            }`}
                          >
                            {moveEvaluation.scoreCp > 0 ? '+' : ''}{moveEvaluation.scoreCp}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
