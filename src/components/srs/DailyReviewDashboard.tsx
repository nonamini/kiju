/**
 * SM-2 Spaced Repetition Daily Review Dashboard Component.
 * Displays due card counts, spaced retention statistics (Mastered, Learning, Overdue),
 * and provides launch actions for today's targeted review session.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Color } from '../../types/shogi';
import { SRSReviewCard } from '../../types/srs';
import { SrsProgressSummary } from '../../utils/srsStorage';

export interface DailyReviewDashboardProps {
  cards: SRSReviewCard[];
  summary: SrsProgressSummary;
  dueCards: SRSReviewCard[];
  selectedSide: Color | 'both';
  onSelectSide: (side: Color | 'both') => void;
  onStartDailyReview: () => void;
  onStartTreeDrill: () => void;
  className?: string;
}

export const DailyReviewDashboard: React.FC<DailyReviewDashboardProps> = ({
  summary,
  dueCards,
  selectedSide,
  onSelectSide,
  onStartDailyReview,
  onStartTreeDrill,
  className = '',
}) => {
  const { t } = useTranslation();

  const hasDueCards = dueCards.length > 0;

  return (
    <div
      className={`rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900 via-slate-900/95 to-slate-950 p-5 shadow-xl ${className}`}
    >
      {/* Header and description */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">📅</span>
            <h3 className="text-base font-bold text-white tracking-wide">
              {t('srs.dashboard_title')}
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {t('srs.dashboard_desc')}
          </p>
        </div>

        {/* Side filter toggle */}
        <div className="inline-flex rounded-lg bg-slate-950 p-1 border border-slate-800 shrink-0">
          <button
            type="button"
            onClick={() => onSelectSide('both')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${
              selectedSide === 'both'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('srs.side_both')}
          </button>
          <button
            type="button"
            onClick={() => onSelectSide('b')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${
              selectedSide === 'b'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            ▲ {t('board.sente')}
          </button>
          <button
            type="button"
            onClick={() => onSelectSide('w')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${
              selectedSide === 'w'
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            △ {t('board.gote')}
          </button>
        </div>
      </div>

      {/* 4 Analytics Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-4">
        {/* Due Today */}
        <div
          className={`rounded-xl border p-3 flex flex-col justify-between transition ${
            hasDueCards
              ? 'border-amber-500/50 bg-amber-950/20 ring-1 ring-amber-500/30'
              : 'border-slate-800 bg-slate-950/60'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
            <span>{t('srs.stat_overdue') ? '復習期日' : '復習期日'}</span>
            <span className="text-base">{hasDueCards ? '🔥' : '✅'}</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span
              className={`text-2xl font-black font-mono ${
                hasDueCards ? 'text-amber-400' : 'text-emerald-400'
              }`}
            >
              {summary.dueCount}
            </span>
            <span className="text-[11px] text-slate-500">{t('srs.positions_unit')}</span>
          </div>
          {summary.overdueCount > 0 && (
            <span className="text-[10px] text-rose-400 mt-1 font-mono">
              ({summary.overdueCount} 局面期日超過)
            </span>
          )}
        </div>

        {/* Mastered */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
            <span>{t('srs.stat_mastered')}</span>
            <span className="text-base">💎</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black font-mono text-purple-400">
              {summary.masteredCount}
            </span>
            <span className="text-[11px] text-slate-500">
              / {summary.totalCount}
            </span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className="bg-purple-500 h-full rounded-full transition-all duration-500"
              style={{
                width: `${
                  summary.totalCount > 0
                    ? Math.round((summary.masteredCount / summary.totalCount) * 100)
                    : 0
                }%`,
              }}
            />
          </div>
        </div>

        {/* Learning */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
            <span>{t('srs.stat_learning')}</span>
            <span className="text-base">🌱</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black font-mono text-cyan-400">
              {summary.learningCount}
            </span>
            <span className="text-[11px] text-slate-500">{t('srs.positions_unit')}</span>
          </div>
          <span className="text-[10px] text-slate-500 mt-1 font-mono">
            新規: {summary.newCount} 局面
          </span>
        </div>

        {/* Retention Accuracy */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
            <span>{t('srs.stat_retention')}</span>
            <span className="text-base">🎯</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black font-mono text-emerald-400">
              {summary.accuracyRatePct}%
            </span>
          </div>
          <span className="text-[10px] text-slate-500 mt-1 font-mono">
            試行: {summary.totalAttempts} 回
          </span>
        </div>
      </div>

      {/* Main Action Bar */}
      <div className="mt-2 pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
        {hasDueCards ? (
          <>
            <div className="text-xs text-slate-300">
              <span className="text-amber-400 font-bold">
                {t('srs.due_cards_count', { count: dueCards.length })}
              </span>
              <span className="text-slate-500 ml-1.5 hidden sm:inline">
                (SM-2 間隔アルゴリズムにより本日復習が推奨される局面です)
              </span>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={onStartDailyReview}
                className="flex-1 sm:flex-initial rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-lg shadow-amber-950/40 hover:from-amber-400 hover:to-amber-500 active:scale-95 transition flex items-center justify-center gap-1.5"
              >
                <span>🚀</span>
                <span>{t('srs.start_daily_review', { count: dueCards.length })}</span>
              </button>
              <button
                type="button"
                onClick={onStartTreeDrill}
                className="rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 px-3 py-2.5 text-xs font-semibold text-slate-300 transition"
                title={t('srs.drill_mode_tree')}
              >
                🌲 {t('srs.drill_mode_tree')}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-xs text-emerald-300">
              <span>{t('srs.all_completed_today')}</span>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={onStartDailyReview}
                className="flex-1 sm:flex-initial rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 px-4 py-2 text-xs font-bold text-slate-200 transition flex items-center justify-center gap-1.5"
              >
                <span>🔄</span>
                <span>{t('srs.start_random_practice')}</span>
              </button>
              <button
                type="button"
                onClick={onStartTreeDrill}
                className="rounded-xl bg-amber-600/90 hover:bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 shadow transition flex items-center justify-center gap-1.5"
              >
                <span>🌲</span>
                <span>{t('srs.drill_mode_tree')}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
