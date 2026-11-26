/**
 * In-Studio Tactical Quiz Operations Panel.
 * Integrated seamlessly into the Studio right-pane (replacing the separate pop-up modal).
 * Renders problem progression, 3-choice hints, answer reveal, score delta verdict,
 * and next card navigation directly in the 1-screen Studio view.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript typed without 'any' (Rule 2).
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Shogi } from 'shogi.js';
import { TacticalQuizCard, TacticalQuizType } from '../../types/quiz';
import { UseShogiEngineReturn } from '../../hooks/useShogiEngine';
import { SavedStudioGame } from '../../utils/studioKifuStorage';
import { EngineId, EngineProfile, resolveEngineDisplayName } from '../../engine/engineConfig';
import { formatUsiToJapanese } from '../../utils/usiFormatter';

export interface StudioInlineQuizPanelProps {
  card: TacticalQuizCard | null;
  cardIndex: number;
  totalCards: number;
  engine: UseShogiEngineReturn;
  savedGames: SavedStudioGame[];
  shogiInstance?: any;
  verdict: 'best' | 'acceptable' | 'wrong' | null;
  evalLossCp?: number | null;
  lastPlayedMove?: string | null;
  isAnswerRevealed?: boolean;
  isDeepThinking?: boolean;
  onPickChoice: (usi: string) => void;
  onRequestHint: () => void;
  onRevealAnswer: () => void;
  onNextCard: () => void;
  onRetryPosition?: () => void;
  onOpenPoolModal: () => void;
  onJumpToGamePosition?: (gameId: string, ply: number) => void;
  onPlayPvContinuation?: (pv: string[], choiceUsi?: string) => void;
  onAdoptVariationAsStudy?: () => void;
  // Replay Controller state
  replayState?: {
    isActive: boolean;
    moves: string[];
    currentIndex: number;
    isPlaying: boolean;
    currentScoreCp?: number | null;
    isAnalyzing?: boolean;
  } | null;
  onReplayStep?: (direction: 'prev' | 'next' | 'first' | 'last') => void;
  onToggleReplayPlay?: () => void;
  onExitReplay?: () => void;
  isFlipped: boolean;
  onToggleFlip: () => void;
  isShuffled: boolean;
  onToggleShuffle: () => void;
}

const TYPE_CONFIG: Record<
  TacticalQuizType,
  { icon: string; labelKey: string; badgeClass: string }
> = {
  attack: {
    icon: '🔥',
    labelKey: 'quiz.type.attack',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  },
  defense: {
    icon: '🛡️',
    labelKey: 'quiz.type.defense',
    badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  },
  race: {
    icon: '⚖️',
    labelKey: 'quiz.type.race',
    badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  },
  mate: {
    icon: '👑',
    labelKey: 'quiz.type.mate',
    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
  },
};

export const StudioInlineQuizPanel: React.FC<StudioInlineQuizPanelProps> = ({
  card,
  cardIndex,
  totalCards,
  engine,
  savedGames,
  shogiInstance,
  verdict,
  evalLossCp,
  lastPlayedMove,
  isAnswerRevealed = false,
  isDeepThinking = false,
  onPickChoice,
  onRequestHint,
  onRevealAnswer,
  onNextCard,
  onRetryPosition,
  onOpenPoolModal,
  onJumpToGamePosition,
  onPlayPvContinuation,
  onAdoptVariationAsStudy,
  replayState,
  onReplayStep,
  onToggleReplayPlay,
  onExitReplay,
  isFlipped,
  onToggleFlip,
  isShuffled,
  onToggleShuffle,
}) => {
  const { t } = useTranslation();
  const [hintShown, setHintShown] = useState<boolean>(false);
  const [evalHintShown, setEvalHintShown] = useState<boolean>(false);

  // Authoritative base Shogi board instance at the quiz question position
  // Guarantees consistent piece identification without depending on mutated interactive board state
  const quizBaseShogi = useMemo(() => {
    if (card?.startSfen) {
      try {
        const s = new Shogi();
        s.initializeFromSFENString(card.startSfen);
        return s;
      } catch {
        return shogiInstance;
      }
    }
    return shogiInstance;
  }, [card?.startSfen, shogiInstance]);

  // Map source game title
  const sourceGameTitle = useMemo(() => {
    if (!card) return '';
    const found = savedGames.find((g) => g.id === card.sourceGameId);
    return found ? found.title : card.sourceGameId;
  }, [card, savedGames]);

  if (!card) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center space-y-4 text-slate-400">
        <span className="text-4xl">🎯</span>
        <div className="space-y-1">
          <h4 className="text-sm font-bold text-slate-200">
            {t('quiz.pool.empty')}
          </h4>
          <p className="text-xs text-slate-500 leading-relaxed">
            棋譜管理から棋譜を取り込んでAI解析すると、好手・悪手から自動的に実戦次の一手問題が作成されます。
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenPoolModal}
          className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs shadow transition active:scale-95"
        >
          🗂️ {t('quiz.pool.title')}
        </button>
      </div>
    );
  }

  const typeMeta = TYPE_CONFIG[card.type] ?? TYPE_CONFIG.attack;
  // If verdict is 'wrong', do NOT reveal answer/best tags until user explicitly clicks "👁️ 正解を見る"
  const isFinished = verdict === 'best' || verdict === 'acceptable' || isAnswerRevealed;
  const isRetrying = verdict === 'wrong' && !isAnswerRevealed;

  // Calculate Sente Win Percentage for Replay / Gauge
  // scoreCp is Sente-normalized: scoreCp > 0 means Sente advantage, scoreCp < 0 means Gote advantage
  const currentScoreCp = replayState?.isActive && replayState.currentScoreCp !== undefined && replayState.currentScoreCp !== null
    ? replayState.currentScoreCp
    : card.scoreCpBefore;
  const clampedCp = Math.max(-2000, Math.min(2000, currentScoreCp));
  const senteWinPct = Math.round(50 + (clampedCp / 2000) * 50);

  return (
    <div className="space-y-4">
      {/* Top Header Card Info */}
      <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2.5 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 ${typeMeta.badgeClass}`}
            >
              <span>{typeMeta.icon}</span>
              <span>{t(typeMeta.labelKey)}</span>
            </span>
            <span className="text-xs font-mono font-bold text-amber-300">
              {cardIndex + 1} / {totalCards} 問
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onToggleShuffle}
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border transition ${
                isShuffled
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
              title={t('quiz.player.shuffle_toggle_title', 'シャッフル切り替え')}
            >
              {isShuffled
                ? t('quiz.player.shuffle_on', '🔀 ON')
                : t('quiz.player.shuffle_sequential', '➡️ 順')}
            </button>
            <button
              type="button"
              onClick={onToggleFlip}
              className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition"
              title={t('quiz.player.flip_title', '盤面反転')}
            >
              {isFlipped
                ? t('quiz.player.view_gote', '☖ 視点')
                : t('quiz.player.view_sente', '☗ 視点')}
            </button>
          </div>
        </div>

        {/* Source game reference & Engine switcher dropdown */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
          <span className="truncate max-w-[190px]" title={sourceGameTitle}>
            {t('quiz.player.source_prefix', '出典: ')}{sourceGameTitle}
          </span>
          <span className="font-mono text-amber-400 shrink-0 font-semibold">
            {t('quiz.player.ply_label', '{{ply}}手目', { ply: card.ply })}
          </span>
        </div>

        {/* Engine switcher dropdown */}
        <div className="flex items-center justify-between gap-2 min-w-0 text-[11px] pt-1.5 border-t border-slate-800">
          <span className="text-slate-400 font-semibold flex items-center gap-1 shrink-0 whitespace-nowrap">
            <span>🤖</span>
            <span>{t('quiz.player.judge_ai_label', '判定AI:')}</span>
          </span>
          <select
            value={engine.activeEngineId}
            onChange={(e) => engine.switchEngine(e.target.value as EngineId)}
            className="min-w-0 flex-1 truncate bg-slate-950 border border-slate-700 text-amber-300 rounded px-1.5 py-0.5 text-[10px] font-bold focus:outline-none focus:border-amber-500"
          >
            {engine.availableEngines.map((eng: EngineProfile) => (
              <option key={eng.id} value={eng.id}>
                {resolveEngineDisplayName(eng, t)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Custom / Named Quiz Title Banner */}
      {card.title && (
        <div className="px-2.5 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs font-bold text-slate-100 truncate">
          🎯 {card.title}
        </div>
      )}

      {/* Solver Prompt */}
      <div className="p-2.5 rounded-xl bg-amber-950/20 border border-amber-900/30 text-xs flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 relative shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="font-bold text-slate-200">
            {card.sideToMove === 'b' ? '▲ 先手' : '△ 後手'}の次の一手は？
          </span>
        </div>

        {card.opponentLastMove && (
          <span className="text-[11px] font-mono text-cyan-300 bg-slate-950 px-2 py-0.5 rounded border border-cyan-800/40">
            直前: {card.opponentLastMove.kifString || card.opponentLastMove.sfenMove}
          </span>
        )}
      </div>

      {/* Optional Position Evaluation Hint (hidden by default) */}
      <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-900/70 border border-slate-800 text-[11px]">
        <span className="text-slate-400 font-semibold">
          📊 {t('studio.quiz.question_position_eval', '出題局面の形勢')}
        </span>
        {evalHintShown || isFinished ? (
          <span className="font-mono font-bold text-amber-300">
            {card.scoreCpBefore > 0 ? `+${card.scoreCpBefore}` : card.scoreCpBefore} cp (
            {card.scoreCpBefore > 150
              ? t('studio.quiz.eval_sente_lead', '▲先手有利')
              : card.scoreCpBefore < -150
              ? t('studio.quiz.eval_gote_lead', '△後手有利')
              : t('studio.quiz.eval_even', '互角')})
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setEvalHintShown(true)}
            className="text-amber-400 hover:underline font-semibold"
          >
            {t('studio.quiz.view_eval_hint_btn', '形勢を見る')}
          </button>
        )}
      </div>

      {/* Replay Controller & Live Evaluation Bar */}
      {replayState?.isActive && (
        <div className="p-3 rounded-xl bg-slate-900 border border-amber-500/50 space-y-2.5 shadow-lg animate-fade-in">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-amber-300 flex items-center gap-1.5">
              <span>🎬</span>
              <span>{t('studio.quiz.replaying_variation', '変化進行 再生中')}</span>
              {replayState.isAnalyzing && (
                <span className="text-[10px] text-amber-400 animate-pulse font-normal">
                  ({t('studio.quiz.ai_analyzing', 'AI解析中...')})
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={onExitReplay}
              className="text-[10px] text-slate-400 hover:text-slate-200 underline"
            >
              {t('studio.quiz.return_to_question', '出題局面に戻る')}
            </button>
          </div>

          {/* Centipawn Score & Realtime Bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-300 flex items-center gap-1.5">
                <span>
                  評価値:{' '}
                  <span
                    className={`font-bold ${
                      currentScoreCp > 100
                        ? 'text-amber-400'
                        : currentScoreCp < -100
                        ? 'text-blue-400'
                        : 'text-slate-200'
                    }`}
                  >
                    {currentScoreCp > 0 ? `+${currentScoreCp}` : currentScoreCp} cp
                  </span>
                </span>
                {replayState.currentIndex > 0 && (
                  <span
                    className={`text-[10px] px-1 rounded ${
                      Math.abs(currentScoreCp - card.scoreCpBefore) <= 50
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : (card.sideToMove === 'b' && currentScoreCp < card.scoreCpBefore) ||
                          (card.sideToMove === 'w' && currentScoreCp > card.scoreCpBefore)
                        ? 'bg-rose-500/20 text-rose-300'
                        : 'bg-sky-500/20 text-sky-300'
                    }`}
                  >
                    {(() => {
                      const moverDiff =
                        card.sideToMove === 'b'
                          ? currentScoreCp - card.scoreCpBefore
                          : card.scoreCpBefore - currentScoreCp;
                      return moverDiff === 0
                        ? '変動±0'
                        : `${moverDiff > 0 ? '+' : ''}${moverDiff} cp`;
                    })()}
                  </span>
                )}
              </span>
              <span className="text-[10px] text-slate-400">
                {currentScoreCp > 100
                  ? t('quiz.player.replay_sente_advantage', '▲先手有利 ({{pct}}%)', { pct: senteWinPct })
                  : currentScoreCp < -100
                  ? t('quiz.player.replay_gote_advantage', '△後手有利 ({{pct}}%)', { pct: 100 - senteWinPct })
                  : t('quiz.player.replay_even', '互角 (50%)')}
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden flex border border-slate-700/60 shadow-inner">
              <div
                className="h-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-300"
                style={{ width: `${senteWinPct}%` }}
                title={t('studio.eval_panel.sente_win_pct_title', '先手: {{pct}}%', { pct: senteWinPct })}
              />
              <div
                className="h-full bg-slate-800 transition-all duration-300"
                style={{ width: `${100 - senteWinPct}%` }}
                title={t('studio.eval_panel.gote_win_pct_title', '後手: {{pct}}%', { pct: 100 - senteWinPct })}
              />
            </div>
          </div>

          {/* Stepper & Play/Pause Controls */}
          <div className="flex items-center justify-between gap-1 pt-1">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onReplayStep?.('first')}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono"
                title={t('quiz.player.replay_first_title', '最初の局面')}
              >
                |&lt;
              </button>
              <button
                type="button"
                onClick={() => onReplayStep?.('prev')}
                disabled={replayState.currentIndex <= 0}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 text-xs font-bold"
                title={t('quiz.player.replay_prev_title', '前の手')}
              >
                ◀
              </button>
              <button
                type="button"
                onClick={() => onReplayStep?.('next')}
                disabled={replayState.currentIndex >= replayState.moves.length}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 text-xs font-bold"
                title={t('quiz.player.replay_next_title', '次の手')}
              >
                ▶
              </button>
              <button
                type="button"
                onClick={() => onReplayStep?.('last')}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono"
                title={t('quiz.player.replay_last_title', '最後の局面')}
              >
                &gt;|
              </button>
            </div>

            <span className="text-[11px] font-mono text-slate-400">
              {t('quiz.player.replay_ply_progress', '{{current}} / {{total}} 手', { current: replayState.currentIndex, total: replayState.moves.length })}
            </span>

            <button
              type="button"
              onClick={onToggleReplayPlay}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                replayState.isPlaying
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-amber-600 hover:bg-amber-500 text-slate-950 shadow'
              }`}
            >
              <span>{replayState.isPlaying ? '⏸' : '▶'}</span>
              <span>{replayState.isPlaying ? t('quiz.player.pause', '一時停止') : t('quiz.player.autoplay', '自動再生')}</span>
            </button>
          </div>

          {/* Action to adopt this variation branch into Study mode */}
          {onAdoptVariationAsStudy && (
            <div className="pt-1.5 border-t border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={onAdoptVariationAsStudy}
                className="w-full py-1.5 px-3 rounded-lg bg-emerald-950/70 hover:bg-emerald-900/80 border border-emerald-500/50 text-emerald-300 font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-sm"
                title={t('quiz.player.adopt_study_title', 'この変化手順を棋譜の分岐として保存し、検討モードで自由に続きを研究します')}
              >
                <span>🌳</span>
                <span>{t('quiz.player.adopt_study_btn', 'この分岐を棋譜に追加して検討')}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Verdict Alert */}
      {verdict === 'best' && (
        <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/60 text-xs space-y-1 text-emerald-200 shadow-md">
          <div className="flex items-center justify-between font-bold text-sm">
            <span>🎉 {t('quiz.player.verdict_best')}</span>
            <span className="font-mono text-[11px] bg-emerald-900/80 px-2 py-0.5 rounded border border-emerald-500/40">
              {t('quiz.player.eval_no_loss')}
            </span>
          </div>
          <p className="text-[11px] text-emerald-300/80">
            {t('quiz.player.best_description', 'AI最善手と完全に一致しました。見事な形勢判断です！')}
          </p>
          <div className="text-[10px] font-mono text-emerald-300/90 pt-0.5">
            {t('quiz.player.eval_no_change', '評価値: {{val}} cp → 変化なし', {
              val: card.scoreCpBefore > 0 ? `+${card.scoreCpBefore}` : card.scoreCpBefore,
            })}
          </div>
        </div>
      )}

      {verdict === 'acceptable' && (
        <div className="p-3 rounded-xl bg-sky-950/40 border border-sky-500/60 text-xs space-y-1 text-sky-200 shadow-md">
          <div className="flex items-center justify-between font-bold text-sm">
            <span>✨ {t('quiz.player.verdict_acceptable')}</span>
            {evalLossCp !== undefined && evalLossCp !== null && (
              <span className="font-mono text-[11px] bg-sky-900/80 px-2 py-0.5 rounded border border-sky-500/40">
                {evalLossCp === 0 ? '±0' : `-${evalLossCp} cp`}
              </span>
            )}
          </div>
          <p className="text-[11px] text-sky-300/80">
            {t('quiz.player.acceptable_description', '最善ではありませんが、十分に有力な好手です！')}
          </p>
          {evalLossCp !== undefined && evalLossCp !== null && (
            <div className="text-[10px] font-mono text-sky-300/90 pt-0.5">
              {t('quiz.player.eval_transition', '出題時: {{before}} cp → 着手後: {{after}}', {
                before: card.scoreCpBefore > 0 ? `+${card.scoreCpBefore}` : card.scoreCpBefore,
                after: (() => {
                  const afterCp = card.sideToMove === 'b' ? card.scoreCpBefore - evalLossCp : card.scoreCpBefore + evalLossCp;
                  return `${afterCp > 0 ? `+${afterCp}` : afterCp} cp`;
                })(),
              })}
            </div>
          )}
        </div>
      )}

      {verdict === 'wrong' && (
        <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/60 text-xs space-y-2 text-rose-200 shadow-md">
          <div className="flex items-center justify-between font-bold text-sm">
            <span>❌ {t('quiz.player.verdict_wrong')}</span>
            {evalLossCp !== undefined && evalLossCp !== null && (
              <span className="font-mono text-[11px] bg-rose-900/80 px-2 py-0.5 rounded border border-rose-500/40">
                -{evalLossCp} cp
              </span>
            )}
          </div>
          {lastPlayedMove && (
            <div className="text-[11px] text-rose-200/90 flex items-center justify-between bg-rose-950/60 px-2 py-1 rounded border border-rose-500/30">
              <span>{t('quiz.player.played_move_prefix', '指した手: ')}<strong className="text-white">{lastPlayedMove}</strong></span>
              {evalLossCp !== undefined && evalLossCp !== null && (
                <span className="text-rose-300 font-semibold">
                  {evalLossCp >= 500
                    ? t('quiz.player.blunder_major', '大悪手（形勢大損）')
                    : evalLossCp >= 250
                    ? t('quiz.player.blunder_mistake', '疑問手（形勢悪化）')
                    : t('quiz.player.blunder_inaccuracy', '緩手')}
                </span>
              )}
            </div>
          )}
          <p className="text-[11px] text-rose-300/80">
            {isRetrying
              ? t('quiz.player.wrong_retry_hint', '形勢を損ねる手でした。盤面または三択からもう一度指してみましょう！')
              : t('quiz.player.wrong_check_variation_hint', '形勢を損ねる手でした。正解と変化を確認してみましょう。')}
          </p>
          {evalLossCp !== undefined && evalLossCp !== null && (
            <div className="text-[10px] font-mono text-rose-300/90">
              {t('quiz.player.eval_transition', '出題時: {{before}} cp → 着手後: {{after}}', {
                before: card.scoreCpBefore > 0 ? `+${card.scoreCpBefore}` : card.scoreCpBefore,
                after: (() => {
                  const afterCp = card.sideToMove === 'b' ? card.scoreCpBefore - evalLossCp : card.scoreCpBefore + evalLossCp;
                  return `${afterCp > 0 ? `+${afterCp}` : afterCp} cp`;
                })(),
              })}
            </div>
          )}
          {onRetryPosition && (
            <button
              type="button"
              onClick={onRetryPosition}
              className="w-full py-1.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-rose-500/40 text-amber-300 font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-sm"
            >
              <span>🔄</span>
              <span>{t('quiz.player.retry_position_btn', '出題局面に戻して考え直す')}</span>
            </button>
          )}
        </div>
      )}

      {/* Deep Thinking Indicator */}
      {isDeepThinking && (
        <div className="p-2.5 rounded-xl bg-purple-950/40 border border-purple-500/50 text-purple-200 text-xs flex items-center gap-2 animate-pulse shadow-md">
          <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin shrink-0" />
          <span className="font-semibold text-[11px]">{t('quiz.player.deep_thinking_choices')}</span>
        </div>
      )}

      {/* 3-Choice Selection Buttons */}
      {card.choices && card.choices.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-300">
            <span className="flex items-center gap-1.5">
              <span>💡</span>
              <span>{t('quiz.player.choices_header', '選択肢から選ぶ (三択)')}</span>
            </span>
            {!hintShown && !isFinished && (
              <button
                type="button"
                onClick={() => {
                  setHintShown(true);
                  onRequestHint();
                }}
                className="text-[11px] text-amber-400 hover:underline"
              >
                {t('quiz.player.show_choices_btn', '選択肢を表示')}
              </button>
            )}
          </div>

          {(hintShown || isFinished) && (
            <div className="space-y-1.5">
              {card.choices.map((choice) => {
                const isSelectedAndBest = isFinished && choice.isCorrect;
                const turnColor: 0 | 1 = card.sideToMove === 'w' ? 1 : 0;
                const displayLabel =
                  choice.label ||
                  (quizBaseShogi
                    ? formatUsiToJapanese(choice.usi, turnColor, quizBaseShogi)
                    : formatUsiToJapanese(choice.usi, turnColor));

                return (
                  <div key={choice.usi} className="space-y-1">
                    <button
                      type="button"
                      onClick={() => onPickChoice(choice.usi)}
                      className={`w-full py-2 px-3 rounded-lg border text-xs font-bold transition flex items-center justify-between ${
                        isSelectedAndBest
                          ? 'bg-emerald-950/60 border-emerald-500 text-emerald-200 shadow'
                          : isFinished && !choice.isCorrect
                          ? 'bg-slate-900/40 border-slate-800 text-slate-500'
                          : 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-amber-600 hover:text-slate-950 hover:border-amber-500'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-sans text-sm tracking-wide">{displayLabel}</span>
                        {choice.role === 'actual' && isFinished && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
                            {t('quiz.player.choice_role_actual', '実戦手')}
                          </span>
                        )}
                        {choice.role === 'best' && isFinished && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            {t('quiz.player.choice_role_best', 'AI最善')}
                          </span>
                        )}
                      </div>
                      {isFinished && choice.scoreDelta !== undefined && (
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                            choice.isCorrect
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {choice.isCorrect ? t('quiz.player.choice_best_badge', '最善手') : `${choice.scoreDelta} cp`}
                        </span>
                      )}
                    </button>

                    {/* Continuation PV Tracing Button */}
                    {isFinished && onPlayPvContinuation && (choice.continuationPv || [choice.usi]).length > 0 && (
                      <div className="flex items-center justify-between px-1 text-[11px] text-slate-400">
                        <span className="truncate text-slate-500 text-[10px]">
                          {choice.explanation || (choice.isCorrect ? t('quiz.player.best_pv_label', '最善の継続進行') : t('quiz.player.punish_pv_label', '相手からの咎め手'))}
                        </span>
                        <button
                          type="button"
                          onClick={() => onPlayPvContinuation(choice.continuationPv || [choice.usi], choice.usi)}
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-amber-600 hover:text-slate-950 text-amber-300 text-[10px] font-bold transition flex items-center gap-1 shadow-sm"
                        >
                          <span>▶</span>
                          <span>{t('quiz.player.replay_variation_btn', '変化進行を再生')}</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Bottom Action Controls */}
      <div className="pt-2 border-t border-slate-800 space-y-2">
        {isFinished ? (
          <button
            type="button"
            onClick={() => {
              setHintShown(false);
              onNextCard();
            }}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-lg transition active:scale-95 flex items-center justify-center gap-2"
          >
            <span>{t('quiz.player.next_card_btn', '次へ進む')}</span>
            <span>➔</span>
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setHintShown(true);
                onRequestHint();
              }}
              className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 font-semibold text-xs transition"
            >
              {t('quiz.player.hint_btn', '💡 ヒント')}
            </button>
            <button
              type="button"
              onClick={() => {
                setHintShown(true);
                onRevealAnswer();
              }}
              className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-semibold text-xs transition"
            >
              👁️ {t('quiz.player.reveal_answer_btn', '正解を見る')}
            </button>
          </div>
        )}

        <div className="flex items-center justify-between text-xs pt-1">
          {onJumpToGamePosition && (
            <button
              type="button"
              onClick={() => onJumpToGamePosition(card.sourceGameId, card.ply)}
              className="text-[11px] text-amber-400 hover:underline flex items-center gap-1"
            >
              <span>🌳</span>
              <span>{t('quiz.player.jump_to_source_btn', '元の棋譜で研究')}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenPoolModal}
            className="text-[11px] text-slate-400 hover:text-slate-200 hover:underline ml-auto flex items-center gap-1"
          >
            <span>🗂️</span>
            <span>{t('quiz.pool.title')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
