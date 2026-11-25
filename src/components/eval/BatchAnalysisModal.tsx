/**
 * Batch Engine Analysis Modal Component.
 * Allows user to configure analysis scope and thinking time,
 * launch automated tree or path traversal, and monitor live progress.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BatchAnalysisProgress } from '../../utils/treeAnalysisEngine';
import { KifuTreeNode, MergedKifuTree } from '../../types/tree';
import {
  EngineId,
  EngineProfile,
  getAllEngineProfiles,
  resolveEngineDescription,
  resolveEngineDisplayName,
  subscribeEngineRegistryChange,
} from '../../engine/engineConfig';

export interface BatchAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAnalyzing: boolean;
  progress: BatchAnalysisProgress | null;
  tree: MergedKifuTree | null;
  activePath: KifuTreeNode[];
  activeEngineId?: EngineId;
  onSwitchEngine?: (engineId: EngineId) => Promise<void>;
  onStartAnalysis: (options: {
    scope: 'path' | 'tree';
    movetimeMs: number;
    skipAlreadyAnalyzed: boolean;
  }) => Promise<void>;
  onCancelAnalysis: () => void;
  className?: string;
}

export const BatchAnalysisModal: React.FC<BatchAnalysisModalProps> = ({
  isOpen,
  onClose,
  isAnalyzing,
  progress,
  tree,
  activePath,
  activeEngineId = 'fairy-stockfish',
  onSwitchEngine,
  onStartAnalysis,
  onCancelAnalysis,
  className = '',
}) => {
  const { t } = useTranslation();

  const [scope, setScope] = useState<'path' | 'tree'>('path');
  const [movetimeMs, setMovetimeMs] = useState<number>(300);
  const [skipAlreadyAnalyzed, setSkipAlreadyAnalyzed] = useState<boolean>(true);
  const [hasFinishedAnalysis, setHasFinishedAnalysis] = useState<boolean>(false);
  const [lastFinishedCount, setLastFinishedCount] = useState<number>(0);

  const [isSwitchingEngine, setIsSwitchingEngine] = useState<boolean>(false);
  const [availableEngines, setAvailableEngines] = useState<EngineProfile[]>(() =>
    getAllEngineProfiles()
  );

  useEffect(() => {
    setAvailableEngines(getAllEngineProfiles());
    return subscribeEngineRegistryChange(() => {
      setAvailableEngines(getAllEngineProfiles());
    });
  }, []);

  if (!isOpen) return null;

  const pathCount = activePath.length;
  const treeCount = tree ? countTreeNodes(tree) : 0;

  const handleEngineChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextEngineId = e.target.value as EngineId;
    if (onSwitchEngine && nextEngineId !== activeEngineId) {
      try {
        setIsSwitchingEngine(true);
        await onSwitchEngine(nextEngineId);
      } finally {
        setIsSwitchingEngine(false);
      }
    }
  };

  const handleStart = async () => {
    setHasFinishedAnalysis(false);
    await onStartAnalysis({
      scope,
      movetimeMs,
      skipAlreadyAnalyzed,
    });
    setHasFinishedAnalysis(true);
    setLastFinishedCount(scope === 'path' ? pathCount : treeCount);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/95 p-6 shadow-2xl text-slate-100 ${className}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚡</span>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                {t('analysis.title')}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {t('analysis.subtitle')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isAnalyzing || isSwitchingEngine}
            className="rounded-lg p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
            title={t('common.close')}
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="mt-4 space-y-4">
          {/* Analysis Completed Banner */}
          {!isAnalyzing && hasFinishedAnalysis && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-3.5 flex items-center justify-between gap-3 text-xs animate-in fade-in duration-200">
              <div className="flex items-center gap-2.5 text-emerald-300 font-semibold">
                <span className="text-base">✅</span>
                <span>{t('analysis.completed_msg', { count: lastFinishedCount })}</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white font-bold px-3 py-1 text-[11px] transition shadow-sm"
              >
                {t('common.close')}
              </button>
            </div>
          )}

          {/* Progress Display (When analyzing) */}
          {isAnalyzing && progress && (
            <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-sky-300">
                  {t('analysis.progress_status', {
                    current: progress.analyzedCount,
                    total: progress.totalCount,
                    percent: progress.percent,
                  })}
                </span>
                <span className="font-mono text-sky-400 font-bold">
                  {progress.percent}%
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
                <div
                  className="bg-gradient-to-r from-sky-500 to-indigo-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>

              {/* Live Info */}
              <div className="text-xs space-y-1 font-mono">
                <div className="text-slate-300 font-medium">
                  {t('analysis.progress_move', {
                    ply: progress.currentPly,
                    move: progress.currentMoveKif,
                  })}
                </div>
                {progress.evaluation && (
                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
                    <span
                      className={`font-bold ${
                        progress.evaluation.scoreCp >= 0
                          ? 'text-emerald-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {t('analysis.progress_live_score', {
                        score:
                          (progress.evaluation.scoreCp > 0 ? '+' : '') +
                          progress.evaluation.scoreCp,
                        depth: progress.evaluation.depth,
                      })}
                    </span>
                    {progress.evaluation.bestMoveKif && (
                      <span className="text-amber-400">
                        {t('analysis.progress_best_move', {
                          move: progress.evaluation.bestMoveKif,
                        })}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Configuration Options (Enabled when not analyzing) */}
          <div className="space-y-4 text-xs">
            {/* Engine Selection */}
            <div>
              <label className="block text-slate-300 font-bold mb-1.5 flex items-center justify-between">
                <span>🤖 {t('analysis.engine_label')}</span>
                {isSwitchingEngine && (
                  <span className="text-[11px] text-amber-400 font-normal animate-pulse">
                    {t('analysis.engine_switching')}
                  </span>
                )}
              </label>
              <div className="relative">
                <select
                  disabled={isAnalyzing || isSwitchingEngine || !onSwitchEngine}
                  value={activeEngineId}
                  onChange={handleEngineChange}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-slate-200 font-medium shadow-inner focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50"
                >
                  {availableEngines.map((profile: EngineProfile) => (
                    <option key={profile.id} value={profile.id}>
                      {resolveEngineDisplayName(profile, t)} ({profile.sizeFormatted}) — {resolveEngineDescription(profile, t)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Scope Selection */}
            <div>
              <label className="block text-slate-300 font-bold mb-1.5">
                {t('analysis.scope_label')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isAnalyzing || isSwitchingEngine || pathCount === 0}
                  onClick={() => setScope('path')}
                  className={`px-3 py-2 rounded-xl text-left font-medium border transition ${
                    scope === 'path'
                      ? 'border-sky-500/50 bg-sky-950/30 text-sky-200'
                      : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <div className="font-bold">📖 {t('analysis.scope_path', { count: pathCount })}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {t('analysis.scope_path_desc')}
                  </div>
                </button>

                <button
                  type="button"
                  disabled={isAnalyzing || isSwitchingEngine || !tree || treeCount === 0}
                  onClick={() => setScope('tree')}
                  className={`px-3 py-2 rounded-xl text-left font-medium border transition ${
                    scope === 'tree'
                      ? 'border-sky-500/50 bg-sky-950/30 text-sky-200'
                      : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <div className="font-bold">🌳 {t('analysis.scope_tree', { count: treeCount })}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {t('analysis.scope_tree_desc')}
                  </div>
                </button>
              </div>
            </div>

            {/* Thinking Time Selection */}
            <div>
              <label className="block text-slate-300 font-bold mb-1.5">
                {t('analysis.movetime_label')}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {[
                  { ms: 100, labelKey: 'analysis.sec_0_1' },
                  { ms: 300, labelKey: 'analysis.sec_0_3' },
                  { ms: 500, labelKey: 'analysis.sec_0_5' },
                  { ms: 1000, labelKey: 'analysis.sec_1_0' },
                ].map((item) => (
                  <button
                    key={item.ms}
                    type="button"
                    disabled={isAnalyzing}
                    onClick={() => setMovetimeMs(item.ms)}
                    className={`py-1.5 px-2 rounded-lg text-center font-mono border transition ${
                      movetimeMs === item.ms
                        ? 'border-amber-500/50 bg-amber-500/15 text-amber-300 font-bold'
                        : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200'
                    } disabled:opacity-40`}
                  >
                    {t(item.labelKey)}
                  </button>
                ))}
              </div>
            </div>

            {/* Skip already analyzed toggle */}
            <div className="pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-slate-300 select-none">
                <input
                  type="checkbox"
                  disabled={isAnalyzing}
                  checked={skipAlreadyAnalyzed}
                  onChange={(e) => setSkipAlreadyAnalyzed(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-sky-500 focus:ring-sky-500/40"
                />
                <span>{t('analysis.skip_already')}</span>
              </label>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-6 pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
          {isAnalyzing ? (
            <button
              type="button"
              onClick={onCancelAnalysis}
              className="rounded-xl border border-rose-500/40 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 px-4 py-2 text-xs font-bold transition flex items-center gap-1.5"
            >
              <span>⏹</span>
              <span>{t('analysis.stop_btn')}</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 text-xs font-medium transition"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleStart}
                className="rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold px-5 py-2 text-xs shadow-lg shadow-sky-950/40 transition active:scale-95 flex items-center gap-1.5"
              >
                <span>⚡</span>
                <span>{t('analysis.start_btn')}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Counts total unique nodes inside a MergedKifuTree.
 */
function countTreeNodes(tree: MergedKifuTree): number {
  let count = 0;
  function traverse(nodes: KifuTreeNode[]) {
    for (const node of nodes) {
      count++;
      if (node.children.length > 0) {
        traverse(node.children);
      }
    }
  }
  traverse(tree.rootNodes);
  return count;
}
