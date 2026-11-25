/**
 * Motivation & Match Performance Dashboard Section (Epic 13, Issues #54 & #55).
 * Displays streak days, 7-day weekly activity stacked bar chart, win-rate trend chart,
 * recent 10-game form, opening & opponent breakdowns, and 9-system opening coverage.
 * Spec: docs/spec/motivation_dashboard.md
 * Follows Rule 1: strictly English code, comments, identifiers; UI text via t().
 * Follows Rule 2: strict TypeScript, zero any.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { MotivationActivityStats } from '../../utils/activityAggregator';
import type { PlayerCategory } from '../../types/player';

export interface MotivationDashboardSectionProps {
  stats: MotivationActivityStats;
}

function getCategoryIcon(category: PlayerCategory | 'unknown'): string {
  if (category === 'ai') return '🤖';
  if (category === 'pro') return '🏯';
  if (category === 'user') return '👤';
  return '⚔️';
}

function formatShortDate(isoDate: string): string {
  // YYYY-MM-DD -> M/D
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${Number(parts[1])}/${Number(parts[2])}`;
}

export const MotivationDashboardSection: React.FC<MotivationDashboardSectionProps> = ({
  stats,
}) => {
  const { t } = useTranslation();

  const maxDailyActions = Math.max(
    1,
    ...stats.weeklySeries.map((bucket) => bucket.totalActions)
  );

  // SVG Win-Rate Trend geometry
  const chartW = 340;
  const chartH = 130;
  const padX = 28;
  const padY = 14;
  const innerW = chartW - padX * 2;
  const innerH = chartH - padY * 2;

  const trendPoints = stats.winRateTrend.map((pt, i) => {
    const count = stats.winRateTrend.length;
    const x =
      count <= 1 ? padX + innerW / 2 : padX + (i / (count - 1)) * innerW;
    const y = padY + (1 - pt.cumulativeWinRate / 100) * innerH;
    return { ...pt, x, y };
  });

  const trendPolyline = trendPoints
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');

  return (
    <section
      className="rounded-2xl bg-slate-900/80 border border-slate-800 p-5 sm:p-6 space-y-5 shadow-xl"
      aria-label={t('dashboard.section_title')}
    >
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-lg">📊</span>
            <h3 className="text-base sm:text-lg font-bold text-slate-100">
              {t('dashboard.section_title')}
            </h3>
          </div>
          <p className="text-xs text-slate-400">
            {t('dashboard.section_subtitle')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="px-2.5 py-1 rounded-full bg-slate-950 border border-slate-800 text-slate-300 font-mono">
            {t('dashboard.total_kifu_badge', { count: stats.totalKifuCount })}
          </span>
          <span className="px-2.5 py-1 rounded-full bg-slate-950 border border-slate-800 text-slate-300 font-mono">
            {t('dashboard.total_srs_badge', {
              mastered: stats.masteredSrsCards,
              total: stats.totalSrsCards,
            })}
          </span>
        </div>
      </div>

      {/* Top KPI Row: 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* KPI 1: Streak */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold">
            <span>🔥 {t('dashboard.streak_title')}</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                stats.activeToday
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {stats.activeToday
                ? t('dashboard.streak_today_done')
                : t('dashboard.streak_keep_alive')}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black font-mono text-amber-300">
              {t('dashboard.days_fmt', { count: stats.currentStreakDays })}
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              {t('dashboard.streak_longest', { count: stats.longestStreakDays })}
            </span>
          </div>
        </div>

        {/* KPI 2: Weekly Activity */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold">
            <span>📅 {t('dashboard.weekly_title')}</span>
            <Link
              to="/library"
              className="text-[10px] text-amber-400 hover:text-amber-300 transition"
            >
              {t('dashboard.cta_library')}
            </Link>
          </div>
          <div className="text-2xl font-black font-mono text-emerald-300">
            {t('dashboard.actions_fmt', { count: stats.weeklyTotalActions })}
          </div>
          <div className="text-[10px] text-slate-400 font-mono truncate">
            {t('dashboard.weekly_breakdown', {
              kifu: stats.weeklyKifuCount,
              match: stats.weeklyMatchCount,
              review: stats.weeklyReviewCount,
            })}
          </div>
        </div>

        {/* KPI 3: Match Record & Recent Form */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold">
            <span>⚔️ {t('dashboard.match_title')}</span>
            <Link
              to="/studio?mode=match"
              className="text-[10px] text-emerald-400 hover:text-emerald-300 transition"
            >
              {t('dashboard.cta_sparring')}
            </Link>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black font-mono text-sky-300">
              {stats.winRate}%
            </span>
            <span className="text-[11px] font-mono text-slate-300">
              {t('dashboard.win_loss_short', {
                wins: stats.wins,
                losses: stats.losses,
              })}
            </span>
          </div>
          <div className="flex items-center gap-1 min-h-[18px]">
            {stats.recentForm.length === 0 ? (
              <span className="text-[10px] text-slate-500">
                {t('dashboard.no_matches_yet')}
              </span>
            ) : (
              stats.recentForm.map((res, idx) => (
                <span
                  key={`form-${idx}`}
                  className={`w-4 h-4 rounded text-[9px] font-bold font-mono flex items-center justify-center ${
                    res === 'win'
                      ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40'
                      : res === 'loss'
                        ? 'bg-rose-500/25 text-rose-300 border border-rose-500/40'
                        : 'bg-slate-700 text-slate-300 border border-slate-600'
                  }`}
                >
                  {res === 'win' ? 'W' : res === 'loss' ? 'L' : 'D'}
                </span>
              ))
            )}
          </div>
        </div>

        {/* KPI 4: Opening Coverage */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold">
            <span>🧭 {t('dashboard.coverage_title')}</span>
            <Link
              to="/studio?quiz=true"
              className="text-[10px] text-indigo-400 hover:text-indigo-300 transition"
            >
              {t('dashboard.cta_quiz')}
            </Link>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black font-mono text-indigo-300">
              {stats.openingCoverage.coveragePct}%
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              {stats.openingCoverage.coveredCount} /{' '}
              {stats.openingCoverage.totalCategories}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-indigo-500 transition-all"
              style={{ width: `${stats.openingCoverage.coveragePct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Middle Row: 7-Day Activity Bars + Win-Rate Trend Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Weekly 7-Day Stacked Bar Chart */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-slate-200">
              📈 {t('dashboard.weekly_chart_title')}
            </h4>
            <div className="flex items-center gap-3 text-[10px] text-slate-400">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-amber-400" />
                {t('dashboard.legend_kifu')}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-emerald-400" />
                {t('dashboard.legend_match')}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-indigo-400" />
                {t('dashboard.legend_review')}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 items-end h-32 pt-4">
            {stats.weeklySeries.map((day) => {
              const kifuPct = (day.kifuCount / maxDailyActions) * 100;
              const matchPct = (day.matchCount / maxDailyActions) * 100;
              const reviewPct = (day.reviewCount / maxDailyActions) * 100;
              return (
                <div
                  key={day.date}
                  className="flex flex-col items-center gap-1.5 h-full justify-end"
                  title={`${day.date}: ${day.totalActions}`}
                >
                  <span className="text-[10px] font-mono text-slate-400">
                    {day.totalActions > 0 ? day.totalActions : ''}
                  </span>
                  <div className="w-full max-w-[28px] flex-1 flex flex-col justify-end rounded-md bg-slate-900/90 border border-slate-800/80 overflow-hidden">
                    {day.reviewCount > 0 && (
                      <div
                        className="w-full bg-indigo-500/85"
                        style={{ height: `${reviewPct}%` }}
                      />
                    )}
                    {day.matchCount > 0 && (
                      <div
                        className="w-full bg-emerald-500/85"
                        style={{ height: `${matchPct}%` }}
                      />
                    )}
                    {day.kifuCount > 0 && (
                      <div
                        className="w-full bg-amber-500/85"
                        style={{ height: `${kifuPct}%` }}
                      />
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    {formatShortDate(day.date)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Cumulative Win-Rate Trend Chart */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-slate-200">
              📉 {t('dashboard.winrate_trend_title')}
            </h4>
            <span className="text-[11px] font-mono text-slate-400">
              {t('dashboard.games_count_fmt', { count: stats.totalMatches })}
            </span>
          </div>

          {trendPoints.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-xs text-slate-500 text-center px-4">
              {t('dashboard.winrate_trend_empty')}
            </div>
          ) : (
            <div className="h-32 w-full">
              <svg
                viewBox={`0 0 ${chartW} ${chartH}`}
                className="w-full h-full overflow-visible"
              >
                {/* Reference grid lines: 100%, 50%, 0% */}
                {[100, 50, 0].map((pct) => {
                  const y = padY + (1 - pct / 100) * innerH;
                  return (
                    <g key={`grid-${pct}`}>
                      <line
                        x1={padX}
                        y1={y}
                        x2={chartW - padX}
                        y2={y}
                        stroke={pct === 50 ? '#475569' : '#1e293b'}
                        strokeWidth={pct === 50 ? 1 : 0.8}
                        strokeDasharray={pct === 50 ? '3,3' : undefined}
                      />
                      <text
                        x={padX - 4}
                        y={y + 3}
                        textAnchor="end"
                        className="text-[8px] font-mono fill-slate-500"
                      >
                        {pct}%
                      </text>
                    </g>
                  );
                })}

                {trendPoints.length >= 2 && (
                  <polyline
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={trendPolyline}
                  />
                )}

                {trendPoints.map((pt) => (
                  <circle
                    key={`trend-${pt.index}`}
                    cx={pt.x}
                    cy={pt.y}
                    r={3.2}
                    fill={
                      pt.result === 'win'
                        ? '#10b981'
                        : pt.result === 'loss'
                          ? '#f43f5e'
                          : '#94a3b8'
                    }
                    stroke="#0f172a"
                    strokeWidth={1.2}
                  >
                    <title>
                      {`#${pt.index} (${pt.date}) vs ${pt.opponentName}: ${pt.cumulativeWinRate}%`}
                    </title>
                  </circle>
                ))}
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Row: Opening Breakdown, Opponent Breakdown, Opening Coverage */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        {/* Opening Breakdown */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2.5">
          <h4 className="font-bold text-slate-200">
            ⚔️ {t('dashboard.opening_breakdown_title')}
          </h4>
          {stats.openingBreakdown.length === 0 ? (
            <p className="text-[11px] text-slate-500">
              {t('dashboard.no_matches_yet')}
            </p>
          ) : (
            <div className="space-y-2">
              {stats.openingBreakdown.slice(0, 5).map((item) => (
                <div key={item.openingId} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-200 truncate pr-2">
                      {item.nameKey ? t(item.nameKey) : item.openingName}
                    </span>
                    <span className="font-mono text-slate-400 shrink-0">
                      {item.wins}W-{item.losses}L ({item.winRate}%)
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-amber-500"
                      style={{ width: `${item.winRate}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Opponent Breakdown */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2.5">
          <h4 className="font-bold text-slate-200">
            🤝 {t('dashboard.opponent_breakdown_title')}
          </h4>
          {stats.opponentBreakdown.length === 0 ? (
            <p className="text-[11px] text-slate-500">
              {t('dashboard.no_matches_yet')}
            </p>
          ) : (
            <div className="space-y-2">
              {stats.opponentBreakdown.slice(0, 5).map((opp) => (
                <div
                  key={`${opp.category}:${opp.opponentName}`}
                  className="space-y-1"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-200 truncate pr-2">
                      {getCategoryIcon(opp.category)} {opp.opponentName}
                    </span>
                    <span className="font-mono text-slate-400 shrink-0">
                      {opp.wins}W-{opp.losses}L ({opp.winRate}%)
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-sky-500"
                      style={{ width: `${opp.winRate}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 9 Major Opening Categories Coverage */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-slate-200">
              🗂️ {t('dashboard.coverage_grid_title')}
            </h4>
            <span className="text-[11px] font-mono text-indigo-300">
              {stats.openingCoverage.coveredCount}/{stats.openingCoverage.totalCategories}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {stats.openingCoverage.items.map((item) => (
              <div
                key={item.openingId}
                className={`rounded-lg px-2 py-1.5 border text-[10px] flex flex-col justify-between gap-0.5 ${
                  item.isCovered
                    ? 'bg-emerald-950/35 border-emerald-500/35 text-emerald-200'
                    : 'bg-slate-900/60 border-slate-800 text-slate-500'
                }`}
              >
                <span className="font-semibold truncate">{t(item.nameKey)}</span>
                <span className="font-mono text-[9px] opacity-80">
                  {item.isCovered
                    ? `${item.kifuCount + item.srsCardCount}`
                    : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
