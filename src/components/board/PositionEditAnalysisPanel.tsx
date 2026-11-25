/**
 * Interactive Manual Analysis & Mate Check Panel rendered over the right pane during Position Edit Mode.
 * Keeps background auto-analysis strictly off while letting users verify forced mates,
 * inspect AI evaluations on demand, and step through resulting move sequences on the board.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoveEvaluation } from '../../types/shogi';
import { clampEvalForChart, formatEvalScore } from '../../utils/evalChartHelper';
import {
  UsiMoveSnapshot,
  buildUsiSequenceSnapshots,
  hasBothKingsInSfen,
} from '../../utils/positionEditor';
import {
  EngineMateSearchFn,
  TsumeMateCheckResult,
  checkTsumeMate,
} from '../../utils/tsumeMateChecker';

export interface EditBoardPreviewState {
  sfen: string;
  stepIndex: number;
  source: 'mate' | 'manual';
  lastMove: { from?: { x: number; y: number }; to: { x: number; y: number } } | null;
}

export interface PositionEditAnalysisPanelProps {
  currentSfen: string;
  engineIsReady: boolean;
  engineIsSearching: boolean;
  activeEngineName: string;
  engineSearchPosition: EngineMateSearchFn;
  onEngineStop: () => void;
  previewState: EditBoardPreviewState | null;
  onPreviewChange: (next: EditBoardPreviewState | null) => void;
}

const MATE_LIMIT_OPTIONS = [1, 3, 5, 7, 9, 11] as const;

interface SequencePreviewBarProps {
  label: string;
  source: 'mate' | 'manual';
  snapshots: UsiMoveSnapshot[];
  previewState: EditBoardPreviewState | null;
  onPreviewChange: (next: EditBoardPreviewState | null) => void;
}

const SequencePreviewBar: React.FC<SequencePreviewBarProps> = ({
  label,
  source,
  snapshots,
  previewState,
  onPreviewChange,
}) => {
  const { t } = useTranslation();
  if (snapshots.length === 0) return null;

  const isSourceActive = previewState?.source === source;
  const activeStep = isSourceActive ? previewState.stepIndex : 0;

  const jumpToStep = (step: number) => {
    if (step <= 0) {
      onPreviewChange(null);
      return;
    }
    const snap = snapshots[step - 1];
    if (!snap) return;
    onPreviewChange({
      sfen: snap.sfen,
      stepIndex: snap.index,
      source,
      lastMove: snap.lastMove,
    });
  };

  return (
    <div className="space-y-2 pt-2 border-t border-slate-800">
      <div className="text-[11px] font-bold text-slate-300">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {snapshots.map((snap) => {
          const isCurrent = isSourceActive && activeStep === snap.index;
          return (
            <button
              key={`${source}-${snap.index}-${snap.usi}`}
              type="button"
              onClick={() => jumpToStep(isCurrent ? 0 : snap.index)}
              className={`px-2 py-1 rounded-md border text-[11px] font-semibold transition ${
                isCurrent
                  ? 'bg-emerald-500 text-slate-950 border-emerald-300 shadow'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700'
              }`}
            >
              {snap.index}. {snap.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 pt-1">
        <button
          type="button"
          disabled={!isSourceActive}
          onClick={() => jumpToStep(0)}
          title={t('position_editor.preview_start_title')}
          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-mono font-bold transition"
        >
          |&lt;
        </button>
        <button
          type="button"
          disabled={!isSourceActive || activeStep <= 0}
          onClick={() => jumpToStep(activeStep - 1)}
          title={t('position_editor.preview_prev_title')}
          className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-mono font-bold transition"
        >
          &lt;
        </button>
        <button
          type="button"
          disabled={activeStep >= snapshots.length}
          onClick={() => jumpToStep(activeStep + 1)}
          title={t('position_editor.preview_next_title')}
          className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-mono font-bold transition"
        >
          &gt;
        </button>
        {isSourceActive && (
          <button
            type="button"
            onClick={() => onPreviewChange(null)}
            className="ml-auto px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-200 text-[11px] font-bold transition"
          >
            {t('position_editor.preview_exit_btn')}
          </button>
        )}
      </div>
    </div>
  );
};

export const PositionEditAnalysisPanel: React.FC<PositionEditAnalysisPanelProps> = ({
  currentSfen,
  engineIsReady,
  engineIsSearching,
  activeEngineName,
  engineSearchPosition,
  onEngineStop,
  previewState,
  onPreviewChange,
}) => {
  const { t } = useTranslation();
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Mate check state
  const [mateMaxPly, setMateMaxPly] = useState<number>(5);
  const [isCheckingMate, setIsCheckingMate] = useState<boolean>(false);
  const [mateState, setMateState] = useState<{
    sfen: string;
    result: TsumeMateCheckResult;
    snapshots: UsiMoveSnapshot[];
  } | null>(null);

  // Manual AI position evaluation state
  const [manualDepth, setManualDepth] = useState<number>(12);
  const [isManualAnalyzing, setIsManualAnalyzing] = useState<boolean>(false);
  const [manualState, setManualState] = useState<{
    sfen: string;
    evaluation: MoveEvaluation | null;
    snapshots: UsiMoveSnapshot[];
  } | null>(null);

  const bothKingsPresent = hasBothKingsInSfen(currentSfen);
  const busy = isCheckingMate || isManualAnalyzing || engineIsSearching;

  const handleRunMateCheck = async () => {
    const targetSfen = currentSfen;
    onPreviewChange(null);
    setIsCheckingMate(true);
    try {
      const res = await checkTsumeMate(
        targetSfen,
        mateMaxPly,
        engineIsReady ? engineSearchPosition : undefined
      );
      if (!isMountedRef.current) return;
      const snapshots = res.hasMate
        ? buildUsiSequenceSnapshots(targetSfen, res.solutionPv ?? [])
        : [];
      setMateState({ sfen: targetSfen, result: res, snapshots });
    } finally {
      if (isMountedRef.current) setIsCheckingMate(false);
    }
  };

  const handleRunManualAi = async () => {
    if (!bothKingsPresent || !engineIsReady) return;
    const targetSfen = currentSfen;
    onPreviewChange(null);
    setIsManualAnalyzing(true);
    try {
      const movetime = manualDepth <= 8 ? 800 : manualDepth <= 12 ? 2000 : 4000;
      const res = await engineSearchPosition(targetSfen, undefined, {
        depth: manualDepth,
        movetime,
      });
      if (!isMountedRef.current) return;
      const rawPv =
        res.evaluation?.pv && res.evaluation.pv.length > 0
          ? res.evaluation.pv
          : res.bestMove && res.bestMove !== 'resign'
            ? [res.bestMove]
            : [];
      const snapshots = buildUsiSequenceSnapshots(targetSfen, rawPv.slice(0, 12));
      setManualState({
        sfen: targetSfen,
        evaluation: res.evaluation ?? null,
        snapshots,
      });
    } catch (err) {
      console.warn('[PositionEditAnalysisPanel] Manual search aborted or failed:', err);
    } finally {
      if (isMountedRef.current) setIsManualAnalyzing(false);
    }
  };

  const manualEval = manualState?.evaluation ?? null;
  const clampedManualScore = manualEval ? clampEvalForChart(manualEval.scoreCp, 2000) : 0;
  const senteWinPct = Math.round(50 + (clampedManualScore / 2000) * 50);

  return (
    <div className="flex flex-col h-full overflow-y-auto p-3.5 gap-3 bg-slate-950/90 backdrop-blur-xs">
      {/* Realtime AI Paused Notice */}
      <div className="rounded-xl border border-amber-500/40 bg-slate-900/95 p-3 space-y-1 shrink-0">
        <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
          <span>⏸️</span>
          <span>{t('position_editor.ai_paused_realtime_title')}</span>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          {t('position_editor.ai_paused_realtime_desc')}
        </p>
      </div>

      {/* Card 1: Mate Check & Interactive Mate Line */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-3 space-y-2.5 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
            <span>🧩</span>
            <span>{t('position_editor.manual_mate_section_title')}</span>
          </h3>
          <select
            value={mateMaxPly}
            disabled={busy}
            onChange={(e) => setMateMaxPly(Number(e.target.value))}
            className="rounded-lg bg-slate-950 border border-slate-700 px-2 py-1 text-[11px] text-slate-100"
          >
            {MATE_LIMIT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {t('position_editor.move_limit_fmt', { count: n })}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => void handleRunMateCheck()}
          className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-bold transition shadow"
        >
          {isCheckingMate
            ? t('position_editor.checking_mate')
            : `🔍 ${t('position_editor.check_mate_btn')}`}
        </button>

        {mateState && mateState.sfen !== currentSfen && (
          <div className="rounded-lg bg-amber-950/50 border border-amber-500/40 px-2.5 py-1.5 text-[11px] text-amber-200">
            ⚠️ {t('position_editor.stale_result_warning')}
          </div>
        )}

        {mateState &&
          (mateState.result.hasMate ? (
            <div className="space-y-2">
              <div className="rounded-lg bg-emerald-950/60 border border-emerald-500/50 px-2.5 py-2 text-xs text-emerald-200 font-semibold">
                ✓ {t('position_editor.mate_found', { ply: mateState.result.matePly ?? mateMaxPly })}
              </div>
              <SequencePreviewBar
                label={t('position_editor.mate_line_label')}
                source="mate"
                snapshots={mateState.snapshots}
                previewState={previewState}
                onPreviewChange={onPreviewChange}
              />
            </div>
          ) : (
            <div className="rounded-lg bg-rose-950/60 border border-rose-500/50 px-2.5 py-2 text-xs text-rose-200 font-semibold">
              ✕ {t(mateState.result.reasonKey ?? 'position_editor.mate_not_found')}
            </div>
          ))}
      </section>

      {/* Card 2: Manual AI Position Analysis */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-3 space-y-2.5 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold text-sky-300 flex items-center gap-1.5 truncate">
            <span>🤖</span>
            <span className="truncate">{t('position_editor.manual_ai_section_title')}</span>
          </h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 truncate max-w-[110px]">
            {activeEngineName}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 text-[11px]">
          <label className="text-slate-400 font-semibold">
            {t('position_editor.depth_label')}
          </label>
          <select
            value={manualDepth}
            disabled={busy}
            onChange={(e) => setManualDepth(Number(e.target.value))}
            className="rounded-lg bg-slate-950 border border-slate-700 px-2 py-1 text-[11px] text-slate-100"
          >
            <option value={8}>{t('position_editor.depth_fast')}</option>
            <option value={12}>{t('position_editor.depth_standard')}</option>
            <option value={16}>{t('position_editor.depth_deep')}</option>
          </select>
        </div>

        {!bothKingsPresent && (
          <div className="rounded-lg bg-slate-950/80 border border-slate-700/80 px-2.5 py-2 text-[11px] text-slate-300 leading-relaxed">
            {t('position_editor.manual_ai_needs_both_kings')}
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={!bothKingsPresent || !engineIsReady || busy}
            onClick={() => void handleRunManualAi()}
            className="flex-1 py-2 px-3 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-45 disabled:cursor-not-allowed text-slate-950 text-xs font-bold transition shadow"
          >
            {isManualAnalyzing
              ? `⏳ ${t('position_editor.manual_analyzing')}`
              : !engineIsReady
                ? t('position_editor.engine_initializing')
                : `⚡ ${t('position_editor.manual_analyze_btn')}`}
          </button>
          {isManualAnalyzing && (
            <button
              type="button"
              onClick={onEngineStop}
              className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition"
            >
              ⏹ {t('position_editor.manual_stop_btn')}
            </button>
          )}
        </div>

        {manualState && manualState.sfen !== currentSfen && (
          <div className="rounded-lg bg-amber-950/50 border border-amber-500/40 px-2.5 py-1.5 text-[11px] text-amber-200">
            ⚠️ {t('position_editor.stale_result_warning')}
          </div>
        )}

        {manualEval && (
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-bold text-slate-100">
                {formatEvalScore(manualEval.scoreCp, manualEval.isMate, manualEval.matePly)}
              </span>
              <span className="text-[11px] text-slate-400">
                {t('position_editor.eval_depth_fmt', { depth: manualEval.depth })}
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-800 overflow-hidden flex border border-slate-700">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-300"
                style={{ width: `${senteWinPct}%` }}
              />
              <div className="h-full flex-1 bg-sky-600/75" />
            </div>
            <SequencePreviewBar
              label={t('position_editor.pv_line_label')}
              source="manual"
              snapshots={manualState?.snapshots ?? []}
              previewState={previewState}
              onPreviewChange={onPreviewChange}
            />
          </div>
        )}
      </section>
    </div>
  );
};
