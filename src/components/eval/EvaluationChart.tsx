import React, { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend,
  ChartOptions,
  ChartData,
  Plugin,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import {
  EvalDataPoint,
  EVAL_SCORE_LIMIT,
  formatEvalScore,
  getEvalAdvantageKey,
} from '../../utils/evalChartHelper';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend
);

export interface EvaluationChartProps {
  evaluations: EvalDataPoint[];
  currentPly: number;
  onSelectPly: (ply: number) => void;
  height?: number;
  maxCpRange?: number;
  onOpenBatchAnalysis?: () => void;
  onAnalyzeCurrentPosition?: () => void;
  isAnalyzing?: boolean;
}

export const EvaluationChart: React.FC<EvaluationChartProps> = ({
  evaluations,
  currentPly,
  onSelectPly,
  height = 140,
  maxCpRange = EVAL_SCORE_LIMIT,
  onOpenBatchAnalysis,
  onAnalyzeCurrentPosition,
  isAnalyzing = false,
}) => {
  const { t } = useTranslation();
  const chartRef = useRef<ChartJS<'line'> | null>(null);

  // Check if any move has engine evaluation data
  const hasEvalData = useMemo(() => {
    return evaluations.some((pt) => pt.ply > 0 && pt.scoreCp !== null);
  }, [evaluations]);

  // Current active evaluation data point
  const currentPoint = useMemo(() => {
    const found = evaluations.find((pt) => pt.ply === currentPly);
    return found ?? evaluations[0] ?? null;
  }, [evaluations, currentPly]);

  // Custom plugin to render vertical cursor line at currentPly
  const verticalCursorPlugin: Plugin<'line'> = useMemo(() => {
    return {
      id: 'verticalCursor',
      afterDatasetsDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        const xScale = scales.x;
        const yScale = scales.y;
        if (!xScale || !yScale || !chartArea) return;

        const targetIndex = evaluations.findIndex((pt) => pt.ply === currentPly);
        if (targetIndex < 0) return;

        const xPos = xScale.getPixelForValue(targetIndex);
        if (xPos < chartArea.left || xPos > chartArea.right) return;

        ctx.save();

        // Vertical dashed indicator
        ctx.beginPath();
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#f59e0b'; // amber-500
        ctx.moveTo(xPos, chartArea.top);
        ctx.lineTo(xPos, chartArea.bottom);
        ctx.stroke();

        // Highlight marker circle on data point
        const yVal = evaluations[targetIndex]?.scoreCp;
        if (yVal !== null && yVal !== undefined) {
          const yPos = yScale.getPixelForValue(yVal);
          ctx.beginPath();
          ctx.setLineDash([]);
          ctx.arc(xPos, yPos, 4, 0, Math.PI * 2);
          ctx.fillStyle = '#f59e0b';
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
        }

        ctx.restore();
      },
    };
  }, [evaluations, currentPly]);

  // Chart.js datasets
  const chartData: ChartData<'line'> = useMemo(() => {
    const labels = evaluations.map((pt) => (pt.ply === 0 ? '0' : String(pt.ply)));
    const dataValues = evaluations.map((pt) => pt.scoreCp);

    return {
      labels,
      datasets: [
        {
          label: t('eval.title'),
          data: dataValues,
          fill: {
            target: 'origin',
            above: 'rgba(16, 185, 129, 0.22)', // Emerald tint for Sente advantage
            below: 'rgba(244, 63, 94, 0.22)', // Rose tint for Gote advantage
          },
          borderColor: '#38bdf8', // Sky-400
          borderWidth: 2,
          pointRadius: evaluations.length > 80 ? 0 : 2,
          pointHoverRadius: 5,
          pointBackgroundColor: '#38bdf8',
          pointBorderColor: '#0f172a',
          pointBorderWidth: 1.5,
          tension: 0.15,
          spanGaps: true,
        },
      ],
    };
  }, [evaluations, t]);

  // Chart options
  const chartOptions: ChartOptions<'line'> = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 250,
      },
      interaction: {
        mode: 'index',
        intersect: false,
      },
      onClick: (_event, elements, chart) => {
        if (elements.length > 0 && elements[0]) {
          const index = elements[0].index;
          const target = evaluations[index];
          if (target) {
            onSelectPly(target.ply);
            return;
          }
        }
        // Fallback for canvas click near vertical slice
        if (_event.native && chart.scales.x) {
          const rect = chart.canvas.getBoundingClientRect();
          const xPixel = (_event.native as MouseEvent).clientX - rect.left;
          const index = Math.round(chart.scales.x.getValueForPixel(xPixel) ?? -1);
          if (index >= 0 && index < evaluations.length) {
            const target = evaluations[index];
            if (target) {
              onSelectPly(target.ply);
            }
          }
        }
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          backgroundColor: '#0f172a',
          borderColor: '#334155',
          borderWidth: 1,
          titleColor: '#f8fafc',
          bodyColor: '#cbd5e1',
          padding: 8,
          displayColors: false,
          callbacks: {
            title: (items) => {
              const item = items[0];
              if (!item) return '';
              const point = evaluations[item.dataIndex];
              if (!point) return '';
              return point.ply === 0
                ? t('board.first_ply')
                : `${point.ply}手目: ${point.moveText}`;
            },
            label: (item) => {
              const point = evaluations[item.dataIndex];
              if (!point) return '';
              if (point.scoreCp === null) return t('eval.no_eval_data');
              const scoreStr = formatEvalScore(point.rawScoreCp, point.isMate, point.matePly);
              const advKey = getEvalAdvantageKey(point.rawScoreCp, point.isMate);
              const advStr = t(advKey);
              const depthStr = point.depth ? ` (${t('eval.depth', { depth: point.depth })})` : '';
              return `${t('eval.score', { score: scoreStr })} [${advStr}]${depthStr}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(51, 65, 85, 0.4)', // Slate-700 subtle
          },
          ticks: {
            color: '#94a3b8',
            font: {
              size: 10,
              family: 'monospace',
            },
            maxTicksLimit: 16,
          },
        },
        y: {
          min: -maxCpRange,
          max: maxCpRange,
          grid: {
            color: (context) => {
              // Highlight zero baseline
              if (context.tick.value === 0) {
                return 'rgba(255, 255, 255, 0.35)';
              }
              return 'rgba(51, 65, 85, 0.3)';
            },
            lineWidth: (context) => (context.tick.value === 0 ? 1.5 : 1),
          },
          ticks: {
            color: '#94a3b8',
            font: {
              size: 10,
              family: 'monospace',
            },
            stepSize: 1000,
            callback: (val) => {
              const num = Number(val);
              if (num > 0) return `+${num}`;
              return String(num);
            },
          },
        },
      },
    };
  }, [evaluations, maxCpRange, onSelectPly, t]);

  // Current score and advantage style
  const scoreBadge = useMemo(() => {
    if (!currentPoint || currentPoint.rawScoreCp === null) {
      return {
        text: '-',
        descKey: 'eval.no_eval_data',
        colorClass: 'text-slate-400 bg-slate-800/60 border-slate-700',
      };
    }

    const formattedScore = formatEvalScore(
      currentPoint.rawScoreCp,
      currentPoint.isMate,
      currentPoint.matePly
    );
    const descKey = getEvalAdvantageKey(currentPoint.rawScoreCp, currentPoint.isMate);

    if (currentPoint.isMate) {
      return {
        text: formattedScore,
        descKey,
        colorClass:
          currentPoint.rawScoreCp >= 0
            ? 'text-amber-300 bg-amber-500/20 border-amber-500/40 font-bold'
            : 'text-rose-300 bg-rose-500/20 border-rose-500/40 font-bold',
      };
    }

    if (currentPoint.rawScoreCp >= 200) {
      return {
        text: formattedScore,
        descKey,
        colorClass: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30 font-medium',
      };
    }
    if (currentPoint.rawScoreCp <= -200) {
      return {
        text: formattedScore,
        descKey,
        colorClass: 'text-rose-400 bg-rose-500/15 border-rose-500/30 font-medium',
      };
    }

    return {
      text: formattedScore,
      descKey,
      colorClass: 'text-slate-300 bg-slate-800 border-slate-700 font-medium',
    };
  }, [currentPoint]);

  return (
    <div className="rounded-xl border border-shogi-border bg-shogi-panel p-3.5 shadow-lg">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-shogi-border/60">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-500">
            {t('eval.title')}
          </span>
          <span className="text-[11px] font-mono text-slate-400">
            {currentPly === 0 ? t('board.first_ply') : t('eval.ply_label', { ply: currentPly })}
          </span>
        </div>

        {/* Actions & Current Score Badge */}
        <div className="flex flex-wrap items-center gap-2">
          {onAnalyzeCurrentPosition && (
            <button
              type="button"
              onClick={onAnalyzeCurrentPosition}
              disabled={isAnalyzing}
              className="px-2.5 py-1 rounded text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 hover:border-sky-500/40 transition disabled:opacity-40 flex items-center gap-1 active:scale-95 shadow-sm"
              title={t('analysis.start_single_btn')}
            >
              <span>🎯</span>
              <span>
                {isAnalyzing ? t('analysis.analyzing_single') : t('analysis.start_single_btn')}
              </span>
            </button>
          )}

          {onOpenBatchAnalysis && (
            <button
              type="button"
              onClick={onOpenBatchAnalysis}
              className="px-2.5 py-1 rounded text-xs font-bold bg-sky-950/50 hover:bg-sky-900/70 text-sky-200 border border-sky-500/40 transition flex items-center gap-1 active:scale-95 shadow-sm"
              title={t('analysis.start_btn')}
            >
              <span>⚡</span>
              <span>{t('analysis.start_btn')}</span>
            </button>
          )}

          {currentPoint?.bestMoveKif && (
            <span className="hidden md:inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs border border-amber-500/30 bg-amber-500/10 text-amber-300 font-medium">
              <span>💡</span>
              <span>{t('analysis.best_move_pill', { move: currentPoint.bestMoveKif })}</span>
            </span>
          )}

          {currentPoint?.depth && (
            <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
              {t('eval.depth', { depth: currentPoint.depth })}
            </span>
          )}
          <span
            className={`rounded px-2 py-0.5 text-xs border ${scoreBadge.colorClass} transition-colors`}
          >
            {t('eval.score', { score: scoreBadge.text })} ({t(scoreBadge.descKey)})
          </span>
        </div>
      </div>

      {/* Chart Canvas Area */}
      <div className="relative mt-2" style={{ height: `${height}px` }}>
        {hasEvalData ? (
          <Line
            ref={chartRef}
            data={chartData}
            options={chartOptions}
            plugins={[verticalCursorPlugin]}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center rounded-lg bg-shogi-bg/50 border border-dashed border-shogi-border/70 p-3 text-center">
            <span className="text-xs font-medium text-slate-400">
              {t('eval.empty_state_title')}
            </span>
            <span className="text-[11px] text-slate-500 mt-0.5">
              {t('eval.empty_state_desc')}
            </span>
          </div>
        )}
      </div>

      {/* Bottom Axis Legends */}
      <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500 px-1 font-mono">
        <span className="flex items-center gap-1 text-emerald-400/80">
          ▲ {t('eval.sente_short')} (+2000)
        </span>
        <span className="text-slate-400">0 ({t('eval.even')})</span>
        <span className="flex items-center gap-1 text-rose-400/80">
          △ {t('eval.gote_short')} (-2000)
        </span>
      </div>
    </div>
  );
};
