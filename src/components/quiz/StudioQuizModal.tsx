/**
 * Unified Studio Tactical Quiz Modal.
 * Integrates:
 * 1. Quiz Practice Mode (Interactive Shogi Board, 3-Choice / Direct board tap, Verdict, AI Explanation, Next Card)
 * 2. Quiz Pool Management Mode (Filter by type, opening, game; toggle cards; delete cards)
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript typed without 'any' (Rule 2).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TacticalQuizCard } from '../../types/quiz';
import { loadQuizPool, saveQuizPool, setQuizEnabled, clearQuizPool } from '../../utils/quizPoolStorage';
import { clearQuizProgress } from '../../utils/quizProgressStorage';
import { useQuizSession } from '../../hooks/useQuizSession';
import { UseShogiEngineReturn } from '../../hooks/useShogiEngine';
import { QuizPlayerPanel } from './QuizPlayerPanel';
import { QuizPoolManager } from './QuizPoolManager';
import { SavedStudioGame } from '../../utils/studioKifuStorage';
import { regenerateAllStudioQuizzes } from '../../utils/studioQuizExtractor';

export interface StudioQuizModalProps {
  isOpen: boolean;
  onClose: () => void;
  engine: UseShogiEngineReturn;
  savedGames: SavedStudioGame[];
  initialQuizId?: string;
  onJumpToGamePosition?: (gameId: string, ply: number) => void;
}

export const StudioQuizModal: React.FC<StudioQuizModalProps> = ({
  isOpen,
  onClose,
  engine,
  savedGames,
  initialQuizId,
  onJumpToGamePosition,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'practice' | 'pool'>('practice');
  const [cards, setCards] = useState<TacticalQuizCard[]>(() => loadQuizPool());
  const [currentCardIndex, setCurrentCardIndex] = useState<number>(0);
  const [isShuffled, setIsShuffled] = useState<boolean>(true);
  const [shuffledIndices, setShuffledIndices] = useState<number[]>([]);
  const [regenerateToast, setRegenerateToast] = useState<string | null>(null);

  // Sync cards whenever modal opens
  useEffect(() => {
    if (isOpen) {
      const fresh = loadQuizPool();
      setCards(fresh);
      if (initialQuizId) {
        const found = fresh.findIndex((c) => c.id === initialQuizId);
        if (found >= 0) {
          setCurrentCardIndex(found);
          setActiveTab('practice');
        }
      }
    }
  }, [isOpen, initialQuizId]);

  // Filter enabled cards for practice session
  const enabledCards = useMemo(() => {
    return cards.filter((c) => c.isEnabled);
  }, [cards]);

  // Maintain shuffled index order for randomized problem progression
  useEffect(() => {
    if (enabledCards.length === 0) {
      setShuffledIndices([]);
      return;
    }
    const indices = enabledCards.map((_, i) => i);
    if (isShuffled) {
      // Fisher-Yates shuffle
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = indices[i]!;
        indices[i] = indices[j]!;
        indices[j] = temp;
      }
    }
    setShuffledIndices(indices);
    setCurrentCardIndex(0);
  }, [enabledCards.length, isShuffled]);

  // Current active card in session
  const activeCard: TacticalQuizCard | null = useMemo(() => {
    if (enabledCards.length === 0) return null;
    const targetIdx = isShuffled && shuffledIndices.length === enabledCards.length
      ? (shuffledIndices[currentCardIndex] ?? 0)
      : currentCardIndex;
    const safeIndex = Math.min(Math.max(0, targetIdx), enabledCards.length - 1);
    return enabledCards[safeIndex] || null;
  }, [enabledCards, currentCardIndex, isShuffled, shuffledIndices]);

  // Map gameId -> title and openingId -> name for labels
  const gameTitles = useMemo(() => {
    const map: Record<string, string> = {};
    savedGames.forEach((g) => {
      map[g.id] = g.title;
    });
    return map;
  }, [savedGames]);

  const openingNames = useMemo(() => {
    const map: Record<string, string> = {};
    savedGames.forEach((g) => {
      if (g.openingId && g.openingName) {
        map[g.openingId] = g.openingName;
      }
    });
    return map;
  }, [savedGames]);

  // Hook for quiz gameplay session
  const session = useQuizSession(activeCard, engine);

  if (!isOpen) return null;

  const handleNextQuiz = () => {
    if (enabledCards.length === 0) return;
    setCurrentCardIndex((prev) => (prev + 1) % enabledCards.length);
  };

  const handleToggleCard = (id: string, enabled: boolean) => {
    const updated = setQuizEnabled(cards, [id], enabled);
    setCards(updated);
    saveQuizPool(updated);
  };

  const handleBulkToggle = (ids: string[], enabled: boolean) => {
    const updated = setQuizEnabled(cards, ids, enabled);
    setCards(updated);
    saveQuizPool(updated);
  };

  const handleStartPracticeWithCard = (cardId: string) => {
    const targetIdx = enabledCards.findIndex((c) => c.id === cardId);
    if (targetIdx >= 0) {
      setCurrentCardIndex(targetIdx);
    }
    setActiveTab('practice');
  };

  const handleRegeneratePool = () => {
    const count = regenerateAllStudioQuizzes(savedGames);
    const fresh = loadQuizPool();
    setCards(fresh);
    setCurrentCardIndex(0);
    setRegenerateToast(t('quiz.pool.regenerate_success_toast', { count }));
    setTimeout(() => {
      setRegenerateToast(null);
    }, 4000);
  };

  const handleClearPool = () => {
    if (!window.confirm(t('quiz.pool.clear_all_confirm'))) return;
    clearQuizPool();
    clearQuizProgress();
    setCards([]);
    setCurrentCardIndex(0);
    setRegenerateToast(t('quiz.pool.clear_success_toast'));
    setTimeout(() => {
      setRegenerateToast(null);
    }, 4000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      {/* Regenerate Toast Notification */}
      {regenerateToast !== null && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs shadow-2xl border border-emerald-300 animate-bounce flex items-center gap-2">
          <span>🔄</span>
          <span>{regenerateToast}</span>
        </div>
      )}
      <div className="relative w-full max-w-5xl max-h-[92vh] flex flex-col bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden font-sans">
        {/* Modal Top Header Bar */}
        <div className="flex items-center justify-between px-3 sm:px-5 py-3 sm:py-3.5 bg-slate-950/90 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 pr-2">
            <span className="text-lg sm:text-xl shrink-0">🎯</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xs sm:text-base font-bold bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent truncate">
                  {t('quiz.studio_modal.header_title', '実戦次の一手特訓スタジオ')}
                </h2>
                <span className="px-1.5 sm:px-2 py-0.2 sm:py-0.5 rounded-full text-[9px] sm:text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold shrink-0">
                  {t('quiz.studio_modal.cards_count', '{{count}} 問', { count: enabledCards.length })}
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-400 hidden sm:block truncate">
                {t('quiz.studio_modal.header_subtitle', '保存済み棋譜の形勢急変点・悪手・妙手から抽出された実戦次の一手集')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Tab switchers: 出題特訓 vs 問題プール管理 */}
            <div className="flex p-0.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('practice')}
                className={`px-2 sm:px-3 py-1 rounded-md transition font-semibold flex items-center gap-1 sm:gap-1.5 ${
                  activeTab === 'practice'
                    ? 'bg-amber-600 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>⚔️</span>
                <span className="text-xs">{t('quiz.studio_modal.tab_practice', '特訓')}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('pool')}
                className={`px-2 sm:px-3 py-1 rounded-md transition font-semibold flex items-center gap-1 sm:gap-1.5 ${
                  activeTab === 'pool'
                    ? 'bg-amber-600 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>🗂️</span>
                <span className="text-xs">{t('quiz.studio_modal.tab_pool_with_count', 'プール ({{count}})', { count: cards.length })}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
              title={t('common.close')}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-950/60">
          {activeTab === 'practice' ? (
            activeCard ? (
              <div className="space-y-3">
                {/* Context bar about the source game */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-amber-300">
                      {t('quiz.studio_modal.card_index_progress', '第 {{current}} / {{total}} 問', {
                        current: currentCardIndex + 1,
                        total: enabledCards.length,
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsShuffled((prev) => !prev)}
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition flex items-center gap-1 ${
                        isShuffled
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                      }`}
                      title={t('quiz.studio_modal.shuffle_tooltip', '問題順のシャッフルON/OFF')}
                    >
                      <span>🔀</span>
                      <span>{isShuffled ? t('quiz.studio_modal.shuffle_active', 'シャッフル中') : t('quiz.studio_modal.shuffle_sequential', '順番通り')}</span>
                    </button>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-300 truncate max-w-sm">
                      {t('quiz.player.source_prefix', '出典: ')}{gameTitles[activeCard.sourceGameId] || activeCard.sourceGameId}
                    </span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-800 text-amber-400 font-mono">
                      {t('quiz.player.ply_label', '{{ply}}手目', { ply: activeCard.ply })}
                    </span>
                  </div>

                  {onJumpToGamePosition && (
                    <button
                      type="button"
                      onClick={() => {
                        onJumpToGamePosition(activeCard.sourceGameId, activeCard.ply);
                        onClose();
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-amber-600/30 text-amber-300 text-xs border border-slate-700 transition flex items-center gap-1"
                      title={t('quiz.studio_modal.jump_to_study_tooltip', 'この棋譜をStudioで開いて詳しく研究')}
                    >
                      <span>🌳</span>
                      <span>{t('quiz.studio_modal.jump_to_study_btn', '棋譜の研究へジャンプ')}</span>
                    </button>
                  )}
                </div>

                {/* Interactive Quiz Player Panel */}
                <QuizPlayerPanel
                  card={activeCard}
                  initialBoard={session.initialBoard}
                  board={session.board}
                  isFlipped={session.isFlipped}
                  step={session.step}
                  totalSteps={session.totalSteps}
                  lastMove={session.lastMove}
                  status={session.status}
                  verdict={session.verdict}
                  evalLossCp={session.evalLossCp}
                  punishInfo={session.punishInfo}
                  hintLevel={session.hintLevel}
                  hintChoices={session.hintChoices}
                  selectedSquare={session.selectedSquare}
                  targetSquares={session.targetSquares}
                  selectedHandPiece={session.selectedHandPiece}
                  onSquareClick={session.onSquareClick}
                  onSelectHandPiece={session.onSelectHandPiece}
                  onRequestHint={session.onRequestHint}
                  onPickChoice={session.onPickChoice}
                  onRevealAnswer={session.onRevealAnswer}
                  onResetCurrentStep={session.onResetCurrentStep}
                  onNext={handleNextQuiz}
                  result={session.result}
                  replayBoard={session.replayBoard}
                  replayLastMove={session.replayLastMove}
                  replayIndex={session.replayIndex}
                  isReplaying={session.isReplaying}
                  isReplayPaused={session.isReplayPaused}
                  onToggleReplay={session.onToggleReplay}
                  onPauseResumeReplay={session.onPauseResumeReplay}
                  onStepReplay={session.onStepReplay}
                  onFlipToggle={session.onFlipToggle}
                />
              </div>
            ) : (
              <div className="py-16 text-center space-y-3 text-slate-400">
                <div className="text-4xl">📭</div>
                <div className="text-sm font-bold text-slate-200">
                  {t('quiz.studio_modal.empty_title', '出題可能なクイズがまだありません')}
                </div>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {t('quiz.studio_modal.empty_desc', 'ライブラリ内の棋譜を一括AI解析すると、好手や悪手・逆転の局面から「実戦次の一手カード」が自動抽出されてここに登録されます。')}
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('pool')}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs shadow transition"
                >
                  {t('quiz.studio_modal.check_pool_btn', '問題プールを確認する')}
                </button>
              </div>
            )
          ) : (
            <QuizPoolManager
              cards={cards}
              gameTitles={gameTitles}
              openingNames={openingNames}
              onToggleCard={handleToggleCard}
              onBulkToggle={handleBulkToggle}
              onRequestAnalysis={() => {}}
              onRegenerate={handleRegeneratePool}
              onClearAll={handleClearPool}
              onStartPractice={() => {
                const firstCard = enabledCards[0];
                if (firstCard) {
                  handleStartPracticeWithCard(firstCard.id);
                } else {
                  setActiveTab('practice');
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};
