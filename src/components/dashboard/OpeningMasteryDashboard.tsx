/**
 * Opening Mastery & Performance Dashboard Component.
 * Visualizes spaced repetition retention metrics and sparring outcomes
 * grouped by standard opening categories, featuring Chart.js stacked progress bars.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
  ChartData,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { OverallMasterySummary, OpeningMasteryStats } from '../../types/mastery';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export interface OpeningMasteryDashboardProps {
  summary: OverallMasterySummary;
  onStartSrsDrill?: (openingId: string) => void;
  onStartSparring?: (openingId: string) => void;
  className?: string;
}

export const OpeningMasteryDashboard: React.FC<OpeningMasteryDashboardProps> = ({
  summary,
  onStartSrsDrill,
  onStartSparring,
  className = '',
}) => {
  const { t } = useTranslation();

  // Filter openings that have at least some activity (cards > 0 or matches > 0)
  const activeOpenings = useMemo(() => {
    const list = summary.openings.filter((o) => o.totalCards > 0 || o.totalMatches > 0);
    return list.length > 0 ? list : summary.openings.slice(0, 5);
  }, [summary.openings]);

  // Chart data: Horizontal Stacked Bar Chart of SRS Card Stages per Opening
  const chartData: ChartData<'bar'> = useMemo(() => {
    const labels = activeOpenings.map((o) => t(o.openingNameKey));

    return {
      labels,
      datasets: [
        {
          label: t('mastery.stage_mastered'),
          data: activeOpenings.map((o) => o.masteredCards),
          backgroundColor: '#10b981', // emerald-500
          borderRadius: 4,
        },
        {
          label: t('mastery.stage_review'),
          data: activeOpenings.map((o) => o.reviewCards),
          backgroundColor: '#0ea5e9', // sky-500
          borderRadius: 4,
        },
        {
          label: t('mastery.stage_learning'),
          data: activeOpenings.map((o) => o.learningCards),
          backgroundColor: '#f59e0b', // amber-500
          borderRadius: 4,
        },
        {
          label: t('mastery.stage_new'),
          data: activeOpenings.map((o) => o.newCards),
          backgroundColor: '#475569', // slate-600
          borderRadius: 4,
        },
      ],
    };
  }, [activeOpenings, t]);

  const chartOptions: ChartOptions<'bar'> = useMemo(
    () => ({
      indexAxis: 'y' as const,
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          stacked: true,
          grid: { color: 'rgba(51, 65, 85, 0.4)' },
          ticks: { color: '#94a3b8', font: { size: 11 } },
        },
        y: {
          stacked: true,
          grid: { display: false },
          ticks: { color: '#cbd5e1', font: { size: 12, weight: 'bold' } },
        },
      },
      plugins: {
        legend: {
          position: 'top' as const,
          labels: {
            color: '#cbd5e1',
            boxWidth: 12,
            boxHeight: 12,
            padding: 16,
            font: { size: 11 },
          },
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#f8fafc',
          bodyColor: '#e2e8f0',
          borderColor: '#334155',
          borderWidth: 1,
          padding: 10,
        },
      },
    }),
    []
  );

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 rounded-2xl border border-amber-500/20 bg-gradient-to-r from-amber-950/20 via-slate-900 to-slate-950 shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-2xl shadow-lg shadow-amber-950/50">
            📊
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-white tracking-wide">
              {t('mastery.title')}
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              {t('mastery.subtitle')}
            </p>
          </div>
        </div>

        {summary.dueTodayCount > 0 && (
          <div className="flex items-center gap-2 self-start sm:self-auto px-3.5 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold animate-pulse">
            <span>⏰</span>
            <span>
              {t('mastery.kpi_due_reviews')}: {summary.dueTodayCount}
            </span>
          </div>
        )}
      </div>

      {/* KPI Stats Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* KPI 1: Overall Mastery Score */}
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 shadow flex flex-col justify-between">
          <span className="text-xs font-medium text-slate-400">
            {t('mastery.kpi_overall_score')}
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-amber-400">
              {summary.overallMasteryPct}%
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">
              {summary.overallMasteryPct >= 80 ? 'Master' : summary.overallMasteryPct >= 50 ? 'Adept' : 'Novice'}
            </span>
          </div>
        </div>

        {/* KPI 2: Mastered Moves */}
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 shadow flex flex-col justify-between">
          <span className="text-xs font-medium text-slate-400">
            {t('mastery.kpi_mastered_cards')}
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-emerald-400">
              {summary.masteredCards}
            </span>
            <span className="text-xs text-slate-400">/ {t('mastery.cards_unit', { count: summary.totalCards, defaultValue: `${summary.totalCards} 手` })}</span>
          </div>
        </div>

        {/* KPI 3: Sparring Win Rate */}
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 shadow flex flex-col justify-between">
          <span className="text-xs font-medium text-slate-400">
            {t('mastery.kpi_sparring_win_rate')}
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-sky-400">
              {summary.overallWinRatePct}%
            </span>
            <span className="text-xs text-slate-400">
              {t('mastery.win_loss_matches', {
                wins: summary.totalWins,
                matches: summary.totalMatches,
                defaultValue: `(${summary.totalWins}勝 / ${summary.totalMatches}局)`,
              })}
            </span>
          </div>
        </div>

        {/* KPI 4: Practiced Openings */}
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 shadow flex flex-col justify-between">
          <span className="text-xs font-medium text-slate-400">
            {t('mastery.registered_openings_count', '登録戦型数')}
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-purple-400">
              {summary.totalOpeningsPracticed}
            </span>
            <span className="text-xs text-slate-400">{t('mastery.openings_unit', '戦型')}</span>
          </div>
        </div>
      </div>

      {/* Chart.js Progress Breakdown Section */}
      <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <span>📈</span>
            <span>{t('mastery.chart_title')}</span>
          </h3>
        </div>

        <div className="h-64 sm:h-72 w-full">
          <Bar data={chartData} options={chartOptions} />
        </div>
      </div>

      {/* Openings Mastery Grid */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-300">
          {t('mastery.openings_detail_cards_heading', '戦型別 詳細カード')}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {summary.openings.map((op: OpeningMasteryStats) => {
            const hasActivity = op.totalCards > 0 || op.totalMatches > 0;

            return (
              <div
                key={op.openingId}
                className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 hover:border-slate-700 transition flex flex-col justify-between"
              >
                <div>
                  {/* Top: Name & Mastery Badge */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="font-bold text-slate-100 text-sm">
                      {t(op.openingNameKey)}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-bold border ${
                        op.masteryPct >= 75
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : op.masteryPct >= 40
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {t('mastery.retention_pct', { pct: op.masteryPct, defaultValue: `${op.masteryPct}% 定着` })}
                    </span>
                  </div>

                  {/* Segmented Progress Bar */}
                  {op.totalCards > 0 ? (
                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden flex mb-3">
                      <div
                        style={{ width: `${(op.masteredCards / op.totalCards) * 100}%` }}
                        className="bg-emerald-500 transition-all duration-500"
                        title={t('mastery.stage_mastered')}
                      />
                      <div
                        style={{ width: `${(op.reviewCards / op.totalCards) * 100}%` }}
                        className="bg-sky-500 transition-all duration-500"
                        title={t('mastery.stage_review')}
                      />
                      <div
                        style={{ width: `${(op.learningCards / op.totalCards) * 100}%` }}
                        className="bg-amber-500 transition-all duration-500"
                        title={t('mastery.stage_learning')}
                      />
                      <div
                        style={{ width: `${(op.newCards / op.totalCards) * 100}%` }}
                        className="bg-slate-600 transition-all duration-500"
                        title={t('mastery.stage_new')}
                      />
                    </div>
                  ) : (
                    <div className="h-2 w-full bg-slate-800 rounded-full mb-3" />
                  )}

                  {/* Metrics details */}
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 py-1">
                    <div>
                      <span className="text-[11px] text-slate-500 block">
                        {t('mastery.drill_cards_label', '暗記カード')}
                      </span>
                      <span className="font-semibold text-slate-200">
                        {op.masteredCards} / {op.totalCards} 手
                      </span>
                    </div>

                    <div>
                      <span className="text-[11px] text-slate-500 block">
                        {t('mastery.sparring_win_rate_label', 'スパーリング勝率')}
                      </span>
                      <span className="font-semibold text-sky-400">
                        {op.winRatePct}%
                      </span>
                      <span className="text-[10px] text-slate-500 ml-1">
                        ({op.matchWins}W {op.matchLosses}L)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500">
                    {op.dueCardsCount > 0 ? (
                      <span className="text-amber-400 font-semibold">
                        {t('mastery.due_cards_count', { count: op.dueCardsCount, defaultValue: `復習期日: ${op.dueCardsCount}手` })}
                      </span>
                    ) : hasActivity ? (
                      <span className="text-emerald-400">{t('mastery.no_due_cards', '期日手なし')}</span>
                    ) : (
                      '未着手'
                    )}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {onStartSrsDrill && (
                      <button
                        type="button"
                        onClick={() => onStartSrsDrill(op.openingId)}
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 transition"
                      >
                        {t('mastery.action_srs_drill')}
                      </button>
                    )}
                    {onStartSparring && (
                      <button
                        type="button"
                        onClick={() => onStartSparring(op.openingId)}
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 transition"
                      >
                        {t('mastery.action_sparring')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
