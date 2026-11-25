/**
 * Studio Match Result Modal Component.
 * Displays clean post-match result summary with outcome, plies, player details,
 * and quick actions: Study/Analyze (transitions to STUDY mode), Rematch, or Close.
 * Follows Rule 1: strictly English code, comments, and identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';

export type StudioMatchOutcome =
  | 'win'
  | 'loss'
  | 'resign_win'
  | 'resign_lose'
  | 'mate_win'
  | 'mate_lose'
  | 'timeout_win'
  | 'timeout_loss'
  | 'sanyata_draw'
  | 'impasse_draw'
  | 'impasse_win'
  | 'impasse_lose';

export interface StudioMatchResultModalProps {
  isOpen: boolean;
  outcome: StudioMatchOutcome | null;
  totalPlies: number;
  senteName: string;
  goteName: string;
  isPlayerSente: boolean;
  onClose: () => void;
  onStudy: () => void;
  onOpenReview?: () => void;
  onRematch: () => void;
}

export const StudioMatchResultModal: React.FC<StudioMatchResultModalProps> = ({
  isOpen,
  outcome,
  totalPlies,
  senteName,
  goteName,
  isPlayerSente,
  onClose,
  onStudy,
  onOpenReview,
  onRematch,
}) => {
  const { t } = useTranslation();

  if (!isOpen || !outcome) return null;

  const isDraw = outcome === 'sanyata_draw' || outcome === 'impasse_draw';
  const isVictory =
    outcome === 'win' ||
    outcome === 'resign_win' ||
    outcome === 'mate_win' ||
    outcome === 'timeout_win' ||
    outcome === 'impasse_win';

  const getHeadline = () => {
    switch (outcome) {
      case 'resign_win':
        return t('studio.match.game_over_resign_win');
      case 'resign_lose':
        return t('studio.match.game_over_resign_lose');
      case 'mate_win':
        return t('studio.match.game_over_mate_win');
      case 'mate_lose':
        return t('studio.match.game_over_mate_lose');
      case 'timeout_win':
        return t('studio.match.game_over_timeout_win');
      case 'timeout_loss':
        return t('studio.match.game_over_timeout_loss');
      case 'sanyata_draw':
        return t('studio.match.game_over_sanyata');
      case 'impasse_draw':
        return t('studio.match.game_over_impasse_draw');
      case 'impasse_win':
        return t('studio.match.game_over_impasse_win');
      case 'impasse_lose':
        return t('studio.match.game_over_impasse_lose');
      case 'win':
        return t('studio.match.game_over_win');
      case 'loss':
      default:
        return t('studio.match.game_over_lose');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in font-sans">
      <div className="bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden text-slate-100 flex flex-col">
        {/* Banner Header */}
        <div
          className={`p-5 text-center flex flex-col items-center justify-center gap-2 border-b ${
            isDraw
              ? 'bg-gradient-to-b from-blue-950/60 to-slate-900 border-blue-500/40'
              : isVictory
              ? 'bg-gradient-to-b from-amber-950/60 to-slate-900 border-amber-500/40'
              : 'bg-gradient-to-b from-rose-950/60 to-slate-900 border-rose-500/40'
          }`}
        >
          <span className="text-4xl animate-bounce">
            {isDraw ? '🤝' : isVictory ? '🏆' : '⚔️'}
          </span>
          <h3
            className={`text-lg font-black tracking-wide ${
              isDraw
                ? 'text-blue-300'
                : isVictory
                ? 'text-amber-300'
                : 'text-rose-300'
            }`}
          >
            {getHeadline()}
          </h3>
          <p className="text-xs text-slate-400">
            {t('studio.match.result_modal_title')}
          </p>
        </div>

        {/* Match Statistics */}
        <div className="p-4 sm:p-5 space-y-3.5 text-xs">
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
              <span className="text-slate-400">{t('studio.match.plies_label', '手数:')}</span>
              <span className="font-mono font-bold text-amber-300 text-sm">
                {t('studio.match.plies_count', '{{count}} 手', { count: totalPlies })}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="space-y-0.5">
                <span className="text-slate-500 block">{t('studio.match.sente_prefix', '▲ 先手:')}</span>
                <span
                  className={`font-semibold truncate block ${
                    isPlayerSente ? 'text-amber-300' : 'text-slate-300'
                  }`}
                >
                  {senteName} {isPlayerSente ? t('studio.match.you_suffix', '(あなた)') : ''}
                </span>
              </div>
              <div className="space-y-0.5">
                <span className="text-slate-500 block">{t('studio.match.gote_prefix', '△ 後手:')}</span>
                <span
                  className={`font-semibold truncate block ${
                    !isPlayerSente ? 'text-amber-300' : 'text-slate-300'
                  }`}
                >
                  {goteName} {!isPlayerSente ? t('studio.match.you_suffix', '(あなた)') : ''}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-950/40 border border-emerald-800/50 text-[11px] text-emerald-300">
            <span>💾</span>
            <span>{t('studio.match.result_save_success')}</span>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            {onOpenReview && (
              <button
                type="button"
                onClick={onOpenReview}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-bold text-xs sm:text-sm shadow-lg transition active:scale-98 flex items-center justify-center gap-2"
              >
                <span>📊</span>
                <span>{t('studio.match.view_review_btn', 'AI終局グラフ・悪手レビューを見る')}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onStudy}
              className={`w-full py-2.5 rounded-xl font-bold text-xs sm:text-sm shadow transition active:scale-98 flex items-center justify-center gap-2 ${
                onOpenReview
                  ? 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700'
                  : 'bg-amber-600 hover:bg-amber-500 text-slate-950 shadow-lg'
              }`}
            >
              <span>🔍</span>
              <span>{t('studio.match.result_action_study')}</span>
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onRematch}
                className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-semibold text-xs transition border border-slate-700 flex items-center justify-center gap-1.5"
              >
                <span>🔄</span>
                <span>{t('studio.match.result_action_rematch')}</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition border border-slate-700"
              >
                {t('studio.match.result_action_close')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
