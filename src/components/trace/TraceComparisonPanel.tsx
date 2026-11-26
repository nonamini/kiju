/**
 * 3-route comparison panel for Interactive Shogi Trace mode (Issue #30 Phase 2).
 * Compares Pro Mainline vs User Variation (+ AI replies) vs AI Best Line,
 * allowing one-click branch saving and seamless return to the mainline.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strict TypeScript, zero `any` (Rule 2).
 */

import React from 'react';
import { useTranslation } from 'react-i18next';

export interface TraceProMoveItem {
  ply: number;
  label: string;
  scoreCp: number | null;
}

export interface TraceUserMoveItem {
  usi: string;
  label: string;
  by: 'user' | 'ai';
  scoreCp: number | null;
}

export interface TraceAiBestLine {
  moves: string[];
  labels: string[];
  scoreCp: number | null;
  isLoading: boolean;
}

export interface TraceComparisonPanelProps {
  anchorPly: number;
  anchorEvalCp: number | null;
  proMoves: TraceProMoveItem[];
  userMoves: TraceUserMoveItem[];
  aiBestLine: TraceAiBestLine;
  isAiThinking: boolean;
  savedMyLine: boolean;
  savedAiLine: boolean;
  isComparisonRevealed: boolean;
  reviewStepIndex: number;
  onSelectReviewStep: (stepIndex: number) => void;
  onRevealComparison: () => void;
  onSaveMyLineAsBranch: () => void;
  onSaveAiLineAsBranch: () => void;
  onReturnToAnchor: () => void;
  onAdvanceMainline: () => void;
  hasNextMainlineMove: boolean;
}

function formatScoreCp(scoreCp: number | null): string {
  if (scoreCp === null) return '-';
  if (Math.abs(scoreCp) >= 29000) {
    return scoreCp > 0 ? '+詰' : '-詰';
  }
  return scoreCp > 0 ? `+${scoreCp}` : `${scoreCp}`;
}

function formatDeltaBadge(
  targetCp: number | null,
  baselineCp: number | null
): { text: string; colorClass: string } | null {
  if (targetCp === null || baselineCp === null) return null;
  if (Math.abs(targetCp) >= 29000 || Math.abs(baselineCp) >= 29000) return null;
  const delta = targetCp - baselineCp;
  const text = delta > 0 ? `+${delta}` : `${delta}`;
  const colorClass =
    delta >= 120
      ? 'text-emerald-300 bg-emerald-950/60 border-emerald-500/40'
      : delta <= -120
      ? 'text-rose-300 bg-rose-950/60 border-rose-500/40'
      : 'text-slate-300 bg-slate-800 border-slate-700';
  return { text, colorClass };
}

export const TraceComparisonPanel: React.FC<TraceComparisonPanelProps> = ({
  anchorPly,
  anchorEvalCp,
  proMoves,
  userMoves,
  aiBestLine,
  isAiThinking,
  savedMyLine,
  savedAiLine,
  isComparisonRevealed,
  reviewStepIndex,
  onSelectReviewStep,
  onRevealComparison,
  onSaveMyLineAsBranch,
  onSaveAiLineAsBranch,
  onReturnToAnchor,
  onAdvanceMainline,
  hasNextMainlineMove,
}) => {
  const { t } = useTranslation();

  if (!isComparisonRevealed) {
    return (
      <div className="p-3 rounded-xl bg-slate-950/85 border border-sky-500/40 space-y-3 text-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="inline-block w-2 h-2 rounded-full bg-sky-400 animate-pulse shrink-0" />
            <span className="font-bold text-sky-300 truncate">
              {t('studio.trace.comparison.sparring_badge', { ply: anchorPly })}
            </span>
          </div>
          {isAiThinking && (
            <span className="shrink-0 text-[11px] font-semibold text-amber-300 animate-pulse">
              🤖 {t('studio.trace.comparison.ai_thinking')}
            </span>
          )}
        </div>

        {/* Played moves so far (no spoilers / no eval scores) */}
        <div className="p-2 rounded-lg bg-sky-950/30 border border-sky-500/40 space-y-1.5">
          <div className="font-bold text-sky-300 text-[11px]">
            ✍️ {t('studio.trace.comparison.route_user')}
          </div>
          <div className="flex flex-wrap gap-1 text-[11px] font-mono">
            {userMoves.map((m, idx) => (
              <span
                key={`${m.usi}-${idx}`}
                className={`px-1.5 py-0.5 rounded border ${
                  m.by === 'user'
                    ? 'bg-sky-900/50 border-sky-500/50 text-sky-200'
                    : 'bg-slate-900 border-slate-700 text-amber-200'
                }`}
              >
                {m.by === 'ai' ? '🤖 ' : ''}
                {anchorPly + idx + 1}.{m.label}
              </span>
            ))}
            {isAiThinking && (
              <span className="px-1.5 py-0.5 rounded border border-dashed border-amber-500/50 text-amber-300 text-[10px]">
                …
              </span>
            )}
          </div>
        </div>

        <p className="text-[11px] text-slate-400 leading-snug">
          {t('studio.trace.comparison.sparring_hint')}
        </p>

        <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
          <button
            type="button"
            disabled={isAiThinking || userMoves.length === 0}
            onClick={onRevealComparison}
            className="w-full py-2 px-3 rounded-lg bg-gradient-to-r from-sky-600 to-sky-500 hover:brightness-110 disabled:opacity-45 text-slate-950 font-bold text-xs shadow transition"
          >
            🔍 {t('studio.trace.comparison.reveal_comparison_btn')}
          </button>
          <button
            type="button"
            onClick={onReturnToAnchor}
            className="w-full py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-[11px] transition"
          >
            ↩️ {t('studio.trace.comparison.return_to_anchor')}
          </button>
        </div>
      </div>
    );
  }

  const latestProEval =
    [...proMoves].reverse().find((m) => m.scoreCp !== null)?.scoreCp ?? null;
  const latestUserEval =
    [...userMoves].reverse().find((m) => m.scoreCp !== null)?.scoreCp ?? null;

  const proDelta = formatDeltaBadge(latestProEval, anchorEvalCp);
  const userDelta = formatDeltaBadge(latestUserEval, anchorEvalCp);
  const aiDelta = formatDeltaBadge(aiBestLine.scoreCp, anchorEvalCp);
  const userVsProDelta = formatDeltaBadge(latestUserEval, latestProEval);

  return (
    <div className="p-3 rounded-xl bg-slate-950/85 border border-sky-500/40 space-y-3 text-xs">
      {/* Header status */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="inline-block w-2 h-2 rounded-full bg-sky-400 animate-pulse shrink-0" />
          <span className="font-bold text-sky-300 truncate">
            {t('studio.trace.comparison.exploring_badge', { ply: anchorPly })}
          </span>
        </div>
        {isAiThinking && (
          <span className="shrink-0 text-[11px] font-semibold text-amber-300 animate-pulse">
            🤖 {t('studio.trace.comparison.ai_thinking')}
          </span>
        )}
      </div>

      {/* Anchor baseline & divergence hint */}
      <div className="flex items-center justify-between text-[11px] text-slate-400 px-2 py-1 rounded bg-slate-900/90 border border-slate-800">
        <span>{t('studio.trace.comparison.anchor_eval_label')}</span>
        <span className="font-mono font-bold text-slate-200">
          {formatScoreCp(anchorEvalCp)} cp
        </span>
      </div>

      {/* 3-Route Comparison Cards */}
      <div className="space-y-2">
        {/* Route 1: Pro Mainline */}
        <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-amber-300 text-[11px]">
              📜 {t('studio.trace.comparison.route_pro')}
            </span>
            <div className="flex items-center gap-1.5 font-mono text-[11px]">
              <span className="text-slate-200 font-bold">{formatScoreCp(latestProEval)}</span>
              {proDelta && (
                <span className={`px-1.5 py-0.2 rounded border text-[10px] ${proDelta.colorClass}`}>
                  {proDelta.text}
                </span>
              )}
            </div>
          </div>
          {proMoves.length > 0 ? (
            <div className="flex flex-wrap gap-1 text-[11px] text-slate-300 font-mono">
              {proMoves.map((m) => (
                <span
                  key={m.ply}
                  className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800"
                >
                  {m.ply}.{m.label}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-slate-500">
              {t('studio.trace.comparison.no_pro_moves')}
            </div>
          )}
        </div>

        {/* Route 2: Your Variation + AI Reply with Step-by-Step Playback */}
        <div className="p-2 rounded-lg bg-sky-950/30 border border-sky-500/40 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-sky-300 text-[11px]">
              ✍️ {t('studio.trace.comparison.route_user')}
            </span>
            <div className="flex items-center gap-1.5 font-mono text-[11px]">
              <span className="text-slate-100 font-bold">{formatScoreCp(latestUserEval)}</span>
              {userDelta && (
                <span className={`px-1.5 py-0.2 rounded border text-[10px] ${userDelta.colorClass}`}>
                  {userDelta.text}
                </span>
              )}
              {userVsProDelta && (
                <span
                  title={t('studio.trace.comparison.vs_pro_tooltip')}
                  className={`px-1.5 py-0.2 rounded border text-[10px] ${userVsProDelta.colorClass}`}
                >
                  {t('studio.trace.comparison.vs_pro_prefix')} {userVsProDelta.text}
                </span>
              )}
            </div>
          </div>

          {/* Step-by-step playback bar & active step eval */}
          {userMoves.length > 0 && (() => {
            const safeStep = Math.max(0, Math.min(userMoves.length, reviewStepIndex));
            const stepEvalCp =
              safeStep === 0 ? anchorEvalCp : (userMoves[safeStep - 1]?.scoreCp ?? null);
            const prevStepEvalCp =
              safeStep === 0
                ? null
                : safeStep === 1
                  ? anchorEvalCp
                  : (userMoves[safeStep - 2]?.scoreCp ?? null);
            const stepPrevDelta = formatDeltaBadge(stepEvalCp, prevStepEvalCp);
            return (
              <div className="flex flex-wrap items-center justify-between gap-1.5 px-2 py-1 rounded bg-slate-900/90 border border-slate-800 text-[11px]">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={safeStep === 0}
                    onClick={() => onSelectReviewStep(0)}
                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-35 text-slate-200 font-mono text-[10px] transition"
                    aria-label="Start"
                  >
                    ⏮
                  </button>
                  <button
                    type="button"
                    disabled={safeStep === 0}
                    onClick={() => onSelectReviewStep(Math.max(0, safeStep - 1))}
                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-35 text-slate-200 font-mono text-[10px] transition"
                    aria-label="Previous"
                  >
                    ◀
                  </button>
                  <span className="px-1 font-mono text-[10px] text-sky-200">
                    {t('studio.trace.comparison.review_step_counter', {
                      step: safeStep,
                      total: userMoves.length,
                    })}
                  </span>
                  <button
                    type="button"
                    disabled={safeStep >= userMoves.length}
                    onClick={() => onSelectReviewStep(Math.min(userMoves.length, safeStep + 1))}
                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-35 text-slate-200 font-mono text-[10px] transition"
                    aria-label="Next"
                  >
                    ▶
                  </button>
                  <button
                    type="button"
                    disabled={safeStep >= userMoves.length}
                    onClick={() => onSelectReviewStep(userMoves.length)}
                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-35 text-slate-200 font-mono text-[10px] transition"
                    aria-label="End"
                  >
                    ⏭
                  </button>
                </div>
                <div className="flex items-center gap-1 font-mono text-[10px]">
                  <span className="text-slate-400">
                    {t('studio.trace.comparison.review_eval_label')}:
                  </span>
                  <span className="font-bold text-slate-100">{formatScoreCp(stepEvalCp)}</span>
                  {stepPrevDelta && (
                    <span
                      className={`px-1 py-0.2 rounded border text-[9px] ${stepPrevDelta.colorClass}`}
                    >
                      {t('studio.trace.comparison.review_prev_delta')} {stepPrevDelta.text}
                    </span>
                  )}
                </div>
              </div>
            );
          })()}

          <div className="flex flex-wrap gap-1 text-[11px] font-mono">
            <button
              type="button"
              onClick={() => onSelectReviewStep(0)}
              className={`px-1.5 py-0.5 rounded border transition ${
                reviewStepIndex === 0
                  ? 'bg-sky-500 text-slate-950 border-sky-300 font-bold ring-1 ring-sky-300'
                  : 'bg-slate-950 border-slate-700 text-slate-300 hover:border-slate-500'
              }`}
            >
              {t('studio.trace.comparison.review_step_anchor')}
            </button>
            {userMoves.map((m, idx) => {
              const stepNum = idx + 1;
              const isSelected = reviewStepIndex === stepNum;
              return (
                <button
                  type="button"
                  key={`${m.usi}-${idx}`}
                  onClick={() => onSelectReviewStep(stepNum)}
                  className={`px-1.5 py-0.5 rounded border transition flex items-center gap-1 ${
                    isSelected
                      ? 'bg-sky-500 text-slate-950 border-sky-300 font-bold ring-1 ring-sky-300'
                      : m.by === 'user'
                        ? 'bg-sky-900/50 border-sky-500/50 text-sky-200 hover:border-sky-400'
                        : 'bg-slate-900 border-slate-700 text-amber-200 hover:border-amber-500/50'
                  }`}
                >
                  <span>
                    {m.by === 'ai' ? '🤖 ' : ''}
                    {anchorPly + idx + 1}.{m.label}
                  </span>
                  {m.scoreCp !== null && (
                    <span
                      className={`text-[9px] ${
                        isSelected ? 'text-slate-900/80' : 'text-slate-400'
                      }`}
                    >
                      ({formatScoreCp(m.scoreCp)})
                    </span>
                  )}
                </button>
              );
            })}
            {isAiThinking && (
              <span className="px-1.5 py-0.5 rounded border border-dashed border-amber-500/50 text-amber-300 text-[10px]">
                …
              </span>
            )}
          </div>
        </div>

        {/* Route 3: AI Best Line */}
        <div className="p-2 rounded-lg bg-emerald-950/20 border border-emerald-500/35 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-emerald-300 text-[11px]">
              🤖 {t('studio.trace.comparison.route_ai')}
            </span>
            <div className="flex items-center gap-1.5 font-mono text-[11px]">
              <span className="text-slate-100 font-bold">
                {aiBestLine.isLoading ? '…' : formatScoreCp(aiBestLine.scoreCp)}
              </span>
              {!aiBestLine.isLoading && aiDelta && (
                <span className={`px-1.5 py-0.2 rounded border text-[10px] ${aiDelta.colorClass}`}>
                  {aiDelta.text}
                </span>
              )}
            </div>
          </div>
          {aiBestLine.isLoading ? (
            <div className="text-[11px] text-slate-400 animate-pulse">
              {t('studio.trace.comparison.ai_line_loading')}
            </div>
          ) : aiBestLine.labels.length > 0 ? (
            <div className="flex flex-wrap gap-1 text-[11px] font-mono text-emerald-200">
              {aiBestLine.labels.map((label, idx) => (
                <span
                  key={`${aiBestLine.moves[idx]}-${idx}`}
                  className="px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/30"
                >
                  {anchorPly + idx + 1}.{label}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-slate-500">
              {t('studio.trace.comparison.no_ai_line')}
            </div>
          )}
        </div>
      </div>

      {/* Continue playing hint */}
      <p className="text-[11px] text-slate-400 leading-snug">
        {t('studio.trace.comparison.continue_hint')}
      </p>

      {/* Branch Saving & Return Actions */}
      <div className="grid grid-cols-1 gap-1.5 pt-1 border-t border-slate-800/80">
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            disabled={userMoves.length === 0 || savedMyLine || isAiThinking}
            onClick={onSaveMyLineAsBranch}
            className="py-1.5 px-2 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 disabled:opacity-45 border border-sky-500/50 text-sky-200 font-semibold text-[11px] transition"
          >
            {savedMyLine
              ? `✓ ${t('studio.trace.comparison.branch_saved')}`
              : `🌿 ${t('studio.trace.comparison.save_my_branch')}`}
          </button>
          <button
            type="button"
            disabled={aiBestLine.moves.length === 0 || savedAiLine || aiBestLine.isLoading}
            onClick={onSaveAiLineAsBranch}
            className="py-1.5 px-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 disabled:opacity-45 border border-emerald-500/50 text-emerald-200 font-semibold text-[11px] transition"
          >
            {savedAiLine
              ? `✓ ${t('studio.trace.comparison.branch_saved')}`
              : `🤖 ${t('studio.trace.comparison.save_ai_branch')}`}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={onReturnToAnchor}
            className="py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-[11px] transition"
          >
            ↩️ {t('studio.trace.comparison.return_to_anchor')}
          </button>
          <button
            type="button"
            disabled={!hasNextMainlineMove}
            onClick={onAdvanceMainline}
            className="py-1.5 px-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-45 text-slate-950 font-bold text-[11px] transition"
          >
            ⏭️ {t('studio.trace.comparison.advance_mainline')}
          </button>
        </div>
      </div>
    </div>
  );
};
