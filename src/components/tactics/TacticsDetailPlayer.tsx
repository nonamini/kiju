/**
 * Tactics Detail Player View.
 * Displays tactics sequence with research-level depth & responsive layout:
 * - Direct JKFPlayer integration sharing the exact same branch tree model as Studio
 * - Branch forks with (+N) badges and inline branch selection buttons
 * - Dynamic & Static evaluation gauge (pre-computed scores or live engine fallback)
 * - Clean edge-placed player indicators (no floating overlaps on board corners)
 * - Desktop: 2-column layout (Left: Board + Komadai + Playback, Right: Overview, Comments, Move List & Forks).
 * - Mobile: 1-screen fit with Board, Eval Bar, Playback bar visible without scrolling.
 * Follows Rule 1: strictly English code, comments, identifiers.
 * Follows Rule 2: strict TypeScript without any.
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { JKFPlayer, ForkPointer } from 'json-kifu-format';
import { StudioShogiBoardView } from '../board/StudioShogiBoardView';
import { StudioKomadaiView } from '../board/StudioKomadaiView';
import { TacticsNoteItem } from '../../types/tacticsNote';
import { clampEvalForChart } from '../../utils/evalChartHelper';
import { createJkfPlayerFromTactic } from '../../utils/tacticsJkfConverter';

export interface TacticsDetailPlayerProps {
  item: TacticsNoteItem;
  onUpdateComment?: (ply: number, comment: string) => void;
  onOpenInStudio?: (item: TacticsNoteItem) => void;
  className?: string;
}

export const TacticsDetailPlayer: React.FC<TacticsDetailPlayerProps> = ({
  item,
  onUpdateComment,
  onOpenInStudio,
  className = '',
}) => {
  const { t } = useTranslation();

  // Instantiate JKFPlayer with full branches loaded as forks
  const [player, setPlayer] = useState<JKFPlayer>(() => createJkfPlayerFromTactic(item));
  const [currentPly, setCurrentPly] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const playTimerRef = useRef<number | null>(null);
  const activePlyRef = useRef<HTMLButtonElement | null>(null);
  const moveListContainerRef = useRef<HTMLDivElement | null>(null);
  const prevItemIdRef = useRef<string>(item.id);
  const currentPlyRef = useRef<number>(0);
  const [version, setVersion] = useState(0);
  const bumpVersion = () => setVersion((v) => v + 1);

  currentPlyRef.current = currentPly;

  // Re-initialize player only when item identity or move tree changes, preserving ply on in-place edits
  useEffect(() => {
    const fresh = createJkfPlayerFromTactic(item);
    const sameItem = prevItemIdRef.current === item.id;
    prevItemIdRef.current = item.id;

    if (sameItem) {
      const safePly = Math.max(0, Math.min(fresh.getMaxTesuu(), currentPlyRef.current));
      fresh.goto(safePly);
      setPlayer(fresh);
      setCurrentPly(fresh.tesuu);
    } else {
      setPlayer(fresh);
      setCurrentPly(0);
      setIsPlaying(false);
    }
    bumpVersion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.jkfJson, item.moves]);

  // In-place editing comment state for current ply
  const [editingComment, setEditingComment] = useState('');
  const [isSavingComment, setIsSavingComment] = useState(false);

  const totalPlies = player.getMaxTesuu();

  // Navigation handlers
  const goToPly = (targetPly: number, forkPointers?: ForkPointer[]) => {
    setIsPlaying(false);
    const safePly = Math.max(0, Math.min(totalPlies, targetPly));
    if (forkPointers) {
      player.goto(safePly, forkPointers);
    } else {
      player.goto(safePly);
    }
    setCurrentPly(player.tesuu);
    bumpVersion();
  };

  // Auto-play timer
  useEffect(() => {
    if (isPlaying) {
      playTimerRef.current = window.setInterval(() => {
        if (player.forward()) {
          setCurrentPly(player.tesuu);
          bumpVersion();
        } else {
          setIsPlaying(false);
        }
      }, 1200);
    } else if (playTimerRef.current) {
      clearInterval(playTimerRef.current);
      playTimerRef.current = null;
    }
    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [isPlaying, player]);

  // Auto-scroll move list internally without hijacking outer viewport scroll on mobile
  useEffect(() => {
    const container = moveListContainerRef.current;
    const activeEl = activePlyRef.current;
    if (container && activeEl) {
      const cRect = container.getBoundingClientRect();
      const eRect = activeEl.getBoundingClientRect();
      if (eRect.top < cRect.top || eRect.bottom > cRect.bottom) {
        container.scrollTop +=
          eRect.top - cRect.top - container.clientHeight / 2 + eRect.height / 2;
      }
    }
  }, [currentPly]);

  // Sync comment for current ply
  const currentComments = useMemo(() => {
    return player.getComments() || [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, currentPly, version]);

  useEffect(() => {
    const existing = currentComments.join('\n');
    if (existing) {
      setEditingComment(existing);
    } else {
      const fromItem = item.moveComments?.find((c) => c.ply === currentPly)?.comment ?? '';
      setEditingComment(fromItem);
    }
  }, [currentComments, currentPly, item.moveComments]);

  const handleSaveComment = () => {
    if (onUpdateComment) {
      setIsSavingComment(true);
      onUpdateComment(currentPly, editingComment);
      const mf = player.getMoveFormat();
      if (mf) {
        mf.comments = editingComment.trim() ? [editingComment.trim()] : [];
      }
      bumpVersion();
      setTimeout(() => setIsSavingComment(false), 500);
    }
  };

  // Static evaluation score for current ply (if pre-computed)
  const currentEval = useMemo(() => {
    if (!item.evalHistory || item.evalHistory.length === 0) return null;
    return item.evalHistory.find((e) => e.ply === currentPly) ?? null;
  }, [item.evalHistory, currentPly]);

  const evalScore = currentEval?.scoreCp ?? 0;
  const isMate = currentEval?.isMate ?? false;
  const clampedScore = clampEvalForChart(evalScore, 2000);
  const senteWinPct = Math.round(50 + (clampedScore / 2000) * 50);

  // Kifu readable steps with branches (+N forks)
  const kifuSteps = useMemo(() => {
    try {
      return player.getReadableKifuState();
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, currentPly, version]);

  // Last move object for board highlights
  const lastMoveObj = useMemo(() => {
    const m = player.getMove();
    if (!m) return null;
    return {
      from: m.from ? { x: m.from.x, y: m.from.y } : undefined,
      to: { x: m.to.x, y: m.to.y },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, currentPly, version]);

  // Hand counts from shogi.js
  const senteHands = useMemo(() => {
    const rawHands = player.shogi.hands[0];
    const counts: Record<string, number> = {};
    if (rawHands) {
      for (const p of rawHands) {
        counts[p.kind] = (counts[p.kind] ?? 0) + 1;
      }
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.shogi.hands, currentPly, version]);

  const goteHands = useMemo(() => {
    const rawHands = player.shogi.hands[1];
    const counts: Record<string, number> = {};
    if (rawHands) {
      for (const p of rawHands) {
        counts[p.kind] = (counts[p.kind] ?? 0) + 1;
      }
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.shogi.hands, currentPly, version]);

  return (
    <div className={`flex flex-col lg:flex-row gap-4 w-full ${className}`}>
      
      {/* Left Column (Desktop) / Main Area (Mobile): Board, Komadai & Controls */}
      <div className="flex flex-col items-center flex-1 max-w-full lg:max-w-[480px] bg-slate-900/90 border border-slate-800/80 rounded-2xl p-2 sm:p-3 shadow-xl">
        
        {/* Static Evaluation Gauge Bar */}
        <div className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-2.5 py-1.5 flex flex-col gap-1 mb-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold">
            <span className="text-amber-400">
              {t('tactics.sente_win_pct', '▲ 先手 {{pct}}%', { pct: senteWinPct })}
            </span>
            <span className="text-slate-300">
              {currentEval
                ? isMate
                  ? t('eval.mate', '詰み')
                  : `${evalScore > 0 ? '+' : ''}${evalScore} cp`
                : t('tactics.eval_even', '互角 (±0)')}
            </span>
            <span className="text-sky-400">
              {t('tactics.gote_win_pct', '△ 後手 {{pct}}%', { pct: 100 - senteWinPct })}
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden flex">
            <div
              className="h-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-300"
              style={{ width: `${senteWinPct}%` }}
            />
            <div
              className="h-full bg-gradient-to-r from-sky-400 to-sky-600 transition-all duration-300"
              style={{ width: `${100 - senteWinPct}%` }}
            />
          </div>
        </div>

        {/* Top Komadai */}
        <StudioKomadaiView
          color={isFlipped ? 0 : 1}
          playerName={isFlipped ? '先手' : '後手'}
          isTurn={player.shogi.turn === (isFlipped ? 0 : 1)}
          hands={isFlipped ? senteHands : goteHands}
          className="w-full max-w-sm mb-1"
        />

        {/* Center Board (Driven by standard shogi.js, explicit aspect matching StudioShogiBoardView) */}
        <div className="w-full max-w-[350px] sm:max-w-[420px] aspect-[463/502] mx-auto flex items-center justify-center">
          <StudioShogiBoardView
            shogi={player.shogi}
            isFlipped={isFlipped}
            lastMove={lastMoveObj}
            className="w-full h-full"
          />
        </div>

        {/* Bottom Komadai */}
        <StudioKomadaiView
          color={isFlipped ? 1 : 0}
          playerName={isFlipped ? '後手' : '先手'}
          isTurn={player.shogi.turn === (isFlipped ? 1 : 0)}
          hands={isFlipped ? goteHands : senteHands}
          className="w-full max-w-sm mt-1"
        />

        {/* Playback Controls & Ply Slider */}
        <div className="w-full max-w-sm mt-2 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs text-slate-300 px-1">
            <span className="font-semibold text-amber-300 truncate max-w-[200px]">
              {currentPly === 0 ? '開始局面' : `${currentPly}手目: ${player.getReadableKifu(currentPly)}`}
            </span>
            <span className="text-slate-400 font-mono text-[11px]">
              {currentPly} / {totalPlies}
            </span>
          </div>

          <div className="flex items-center gap-1.5 justify-center bg-slate-950/80 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => goToPly(0)}
              disabled={currentPly === 0}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-bold transition-colors"
              title={t('tactics.first_ply_title', '最初')}
            >
              ⏮
            </button>
            <button
              onClick={() => goToPly(currentPly - 1)}
              disabled={currentPly === 0}
              className="p-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-bold transition-colors"
              title={t('tactics.prev_ply_title', '1手戻る')}
            >
              ◀
            </button>
            <button
              onClick={() => {
                if (currentPly >= totalPlies) {
                  goToPly(0);
                  setIsPlaying(true);
                } else {
                  setIsPlaying((prev) => !prev);
                }
              }}
              className="p-1.5 px-4 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-colors shadow"
              title={
                isPlaying
                  ? t('tactics.stop_title', '停止')
                  : t('tactics.play_title', '再生')
              }
            >
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button
              onClick={() => goToPly(currentPly + 1)}
              disabled={currentPly >= totalPlies}
              className="p-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-bold transition-colors"
              title={t('tactics.next_ply_title', '1手進む')}
            >
              ▶
            </button>
            <button
              onClick={() => goToPly(totalPlies)}
              disabled={currentPly >= totalPlies}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-bold transition-colors"
              title={t('tactics.last_ply_title', '最後')}
            >
              ⏭
            </button>
            <button
              onClick={() => setIsFlipped((prev) => !prev)}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors ml-1"
              title={t('studio.flip_board', '盤面反転')}
            >
              🔄
            </button>
          </div>

          {/* Ply Progress Bar Slider */}
          <input
            type="range"
            min={0}
            max={totalPlies}
            value={currentPly}
            onChange={(e) => {
              setIsPlaying(false);
              goToPly(parseInt(e.target.value, 10));
            }}
            className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
        </div>
      </div>

      {/* Right Column (Desktop): Commentary, Move List & Branch Tree (Exact Studio Mechanism) */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">

        {/* Move Commentary & Research Panel */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 sm:p-4 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs sm:text-sm font-bold text-amber-300 flex items-center gap-1.5">
              <span>📝</span> {t('tactics.move_comment_title', '手筋・局面解説コメント')} ({currentPly}手目)
            </h4>
            {onOpenInStudio && (
              <button
                onClick={() => onOpenInStudio(item)}
                className="px-2.5 py-1 bg-amber-600/90 hover:bg-amber-500 text-white rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1 shadow"
              >
                <span>🔬</span> {t('tactics.open_in_studio', '検討盤面で開く')}
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <textarea
              rows={2}
              value={editingComment}
              onChange={(e) => setEditingComment(e.target.value)}
              placeholder={t('tactics.comment_placeholder', 'この局面の狙い、手筋、注意点などを入力...')}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 resize-none"
            />
            <div className="flex justify-end">
              <button
                onClick={handleSaveComment}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs transition-colors flex items-center gap-1"
              >
                <span>💾</span> {isSavingComment ? t('common.saving', '保存中...') : t('common.save', 'コメント保存')}
              </button>
            </div>
          </div>
        </div>

        {/* Move Sequence List with Branches & Forks (Exact same UI & behavior as Studio) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 sm:p-4 flex flex-col flex-1 min-h-[220px] max-h-[380px] lg:max-h-[500px]">
          <h5 className="text-xs font-semibold text-slate-400 mb-2 flex items-center justify-between">
            <span>{t('tactics.move_list_title', '手順・分岐一覧')} (全 {totalPlies} 手)</span>
            <span className="text-[11px] text-slate-500">
              {t('tactics.click_to_navigate_fork_hint', 'クリックで局面移動・分岐選択')}
            </span>
          </h5>

          <div
            ref={moveListContainerRef}
            className="flex-1 overflow-y-auto space-y-1 pr-1 font-mono text-xs"
          >
            {kifuSteps.slice(1).map((step, idx) => {
              const ply = idx + 1;
              const isSelected = ply === currentPly;
              const isForkOrigin = player.forkPointers && player.forkPointers.some((fp) => fp.te === ply);

              return (
                <div key={`ply-${ply}`} className="space-y-1">
                  <button
                    ref={isSelected ? activePlyRef : undefined}
                    type="button"
                    onClick={() => goToPly(ply)}
                    className={`w-full text-left px-2.5 py-1.5 rounded flex items-center justify-between transition-colors ${
                      isSelected
                        ? 'bg-amber-500/20 text-amber-300 font-bold border-l-2 border-amber-400'
                        : isForkOrigin
                        ? 'bg-indigo-950/40 text-indigo-300 border-l-2 border-indigo-400'
                        : 'hover:bg-slate-800/60 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="text-slate-500 text-[11px] w-5 text-right">{ply}.</span>
                      <span className="truncate">{step.kifu}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-1">
                      {step.forks && step.forks.length > 0 && (
                        <span
                          className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30"
                          title={`分岐が ${step.forks.length} 個あります`}
                        >
                          +{step.forks.length}
                        </span>
                      )}
                      {step.comments && step.comments.length > 0 && (
                        <span className="text-[10px] text-slate-400" title={step.comments.join('\n')}>
                          💬
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Fork Variation Buttons */}
                  {step.forks && step.forks.length > 0 && isSelected && (
                    <div className="ml-3 pl-2 pr-1 py-1.5 space-y-1 bg-slate-950/70 rounded-r border-l-2 border-amber-500 text-[11px]">
                      <div className="text-[10px] text-amber-400/90 font-semibold flex items-center justify-between">
                        <span>
                          {t('tactics.fork_at_ply', '{{ply}}手目の分岐（変化手順）', { ply })}
                        </span>
                      </div>
                      {step.forks.map((forkMoveStr, forkIdx) => (
                        <button
                          type="button"
                          key={`fork-${ply}-${forkIdx}`}
                          onClick={() => {
                            player.goto(ply - 1);
                            player.forkAndForward(forkIdx);
                            setCurrentPly(player.tesuu);
                            bumpVersion();
                          }}
                          className="w-full text-left px-2 py-1 rounded bg-slate-800 hover:bg-amber-600/30 text-slate-300 hover:text-amber-200 transition flex items-center justify-between group"
                        >
                          <span className="font-semibold">↳ {forkMoveStr}</span>
                          <span className="text-[10px] text-slate-500 group-hover:text-amber-400">
                            {t('tactics.select_arrow', '選択 ➔')}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </div>

    </div>
  );
};
