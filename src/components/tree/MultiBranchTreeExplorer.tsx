/**
 * Interactive Multi-Branch Tree Explorer Component.
 * Displays branch variations, win-rate breakdown, engine evaluation score,
 * and game references for the active node and junction plies.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KifuTreeNode, MergedKifuTree } from '../../types/tree';

export interface MultiBranchTreeExplorerProps {
  tree: MergedKifuTree | null;
  activePath: KifuTreeNode[];
  currentPly: number;
  candidateMoves: KifuTreeNode[];
  onSelectBranch: (node: KifuTreeNode) => void;
  onSelectPly: (ply: number) => void;
  onUpdateNodeComment?: (nodeId: string, comment: string) => void;
}

export const MultiBranchTreeExplorer: React.FC<MultiBranchTreeExplorerProps> = ({
  tree,
  activePath,
  currentPly,
  candidateMoves,
  onSelectBranch,
  onSelectPly,
  onUpdateNodeComment,
}) => {
  const { t } = useTranslation();
  const [isEditingComment, setIsEditingComment] = useState(false);
  const [tempComment, setTempComment] = useState('');

  const activeNode: KifuTreeNode | undefined =
    currentPly > 0 ? activePath[currentPly - 1] : undefined;

  const totalGames = tree?.totalGames ?? 0;

  // Next candidate moves from current position
  const nextCandidates: KifuTreeNode[] =
    currentPly === 0
      ? tree?.rootNodes ?? []
      : activeNode?.children ?? [];

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-shogi-border bg-shogi-panel p-4 shadow-lg">
      {/* Explorer Header */}
      <div className="flex items-center justify-between pb-2 border-b border-shogi-border/60">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-500">
            {t('tree.branch_title')}
          </h2>
          {activeNode && (
            <span className="text-xs font-bold text-slate-100 font-mono">
              {currentPly}手目: {activeNode.move.color === 'b' ? '▲' : '△'} {activeNode.move.kifString}
            </span>
          )}
        </div>
        <span className="text-[11px] text-slate-400 font-mono">
          {t('ingestion.total_games', { count: totalGames })}
        </span>
      </div>

      {/* Active Position Statistics Card */}
      {activeNode && (
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-2 text-xs">
          {/* Win / Loss Bar */}
          <div>
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
              <span>
                {t('board.sente')}: {activeNode.wins.sente}勝 (
                {activeNode.gameCount > 0
                  ? ((activeNode.wins.sente / activeNode.gameCount) * 100).toFixed(0)
                  : 0}
                %)
              </span>
              <span>
                {t('board.gote')}: {activeNode.wins.gote}勝 (
                {activeNode.gameCount > 0
                  ? ((activeNode.wins.gote / activeNode.gameCount) * 100).toFixed(0)
                  : 0}
                %)
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden flex">
              <div
                className="bg-amber-500 h-full transition-all"
                style={{
                  width: `${
                    activeNode.gameCount > 0
                      ? (activeNode.wins.sente / activeNode.gameCount) * 100
                      : 50
                  }%`,
                }}
              />
              <div
                className="bg-indigo-500 h-full transition-all"
                style={{
                  width: `${
                    activeNode.gameCount > 0
                      ? (activeNode.wins.gote / activeNode.gameCount) * 100
                      : 50
                  }%`,
                }}
              />
            </div>
          </div>

          {/* Comment & Engine Analysis */}
          {activeNode.evaluation && (
            <div className="flex flex-col gap-1 text-[11px] pt-1.5 border-t border-slate-800/80">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">{t('eval.title')}:</span>
                <span
                  className={`font-mono font-bold ${
                    activeNode.evaluation.scoreCp >= 0 ? 'text-emerald-400' : 'text-indigo-400'
                  }`}
                >
                  {activeNode.evaluation.scoreCp >= 0 ? '+' : ''}
                  {activeNode.evaluation.scoreCp}
                  {activeNode.evaluation.depth ? ` (d=${activeNode.evaluation.depth})` : ''}
                </span>
              </div>
              {activeNode.evaluation.bestMoveKif && (
                <div className="flex items-center justify-between text-amber-300">
                  <span className="text-slate-500">{t('tree.ai_recommendation', 'AI推奨:')}</span>
                  <span className="font-bold">{activeNode.evaluation.bestMoveKif}</span>
                </div>
              )}
            </div>
          )}

          {/* Position Comment / Notes */}
          <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="font-semibold flex items-center gap-1">
                <span>📝</span>
                <span>{t('tree.notes_title')}</span>
              </span>
              {!isEditingComment && onUpdateNodeComment && (
                <button
                  type="button"
                  onClick={() => {
                    setTempComment(activeNode.comment || '');
                    setIsEditingComment(true);
                  }}
                  className="text-amber-400 hover:text-amber-300 transition text-[10px] font-bold"
                >
                  {activeNode.comment ? t('tree.notes_edit') : t('tree.notes_add')}
                </button>
              )}
            </div>

            {isEditingComment ? (
              <div className="space-y-1.5">
                <textarea
                  value={tempComment}
                  onChange={(e) => setTempComment(e.target.value)}
                  placeholder={t('tree.notes_placeholder')}
                  rows={2}
                  className="w-full bg-slate-950 border border-amber-500/50 rounded-lg p-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-400 font-mono"
                  autoFocus
                />
                <div className="flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsEditingComment(false)}
                    className="px-2 py-0.5 rounded text-[10px] text-slate-400 hover:text-slate-200"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (onUpdateNodeComment) {
                        onUpdateNodeComment(activeNode.id, tempComment.trim());
                      }
                      setIsEditingComment(false);
                    }}
                    className="px-2.5 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-[10px] shadow"
                  >
                    {t('common.save')}
                  </button>
                </div>
              </div>
            ) : activeNode.comment ? (
              <p className="text-[11px] text-slate-300 font-mono bg-slate-900/60 rounded p-2 border border-slate-800/50 whitespace-pre-wrap">
                {activeNode.comment}
              </p>
            ) : null}
          </div>
        </div>
      )}

      {/* Sibling Variations (Available choices for current move) */}
      {candidateMoves.length > 1 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
            <span>
              {t('tree.current_ply_candidates', '{{ply}}手目の候補手・変化 ({{count}})', {
                ply: currentPly,
                count: candidateMoves.length,
              })}
            </span>
          </div>
          <div className="space-y-1.5">
            {candidateMoves.map((cand, idx) => {
              const isSelected = cand.id === activeNode?.id;
              const isSente = cand.move.color === 'b';
              const pct = totalGames > 0 ? Math.round((cand.gameCount / totalGames) * 100) : 0;

              return (
                <div
                  key={cand.id}
                  onClick={() => onSelectBranch(cand)}
                  className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                    isSelected
                      ? 'border-amber-500 bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/30'
                      : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={isSente ? 'text-amber-400' : 'text-indigo-400'}>
                      {isSente ? '▲' : '△'}
                    </span>
                    <span className="font-bold">{cand.move.kifString}</span>
                    <span
                      className={`text-[10px] px-1 py-0.5 rounded ${
                        cand.isMainline
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {cand.isMainline ? t('tree.mainline') : t('tree.variation', { index: idx })}
                    </span>
                  </div>

                  <span className="text-[11px] font-mono text-slate-400">
                    {cand.gameCount}局 ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Next Move Candidates (Moving forward) */}
      {nextCandidates.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
            <span>
              {t('tree.next_ply_candidates', '{{ply}}手目の候補手 ({{count}})', {
                ply: currentPly + 1,
                count: nextCandidates.length,
              })}
            </span>
          </div>
          <div className="space-y-1.5">
            {nextCandidates.map((next, idx) => {
              const isSente = next.move.color === 'b';
              const pct = totalGames > 0 ? Math.round((next.gameCount / totalGames) * 100) : 0;

              return (
                <div
                  key={next.id}
                  onClick={() => {
                    onSelectBranch(next);
                    onSelectPly(currentPly + 1);
                  }}
                  className="flex items-center justify-between p-2 rounded-lg border border-slate-800 bg-slate-900/60 text-xs cursor-pointer hover:border-amber-500/50 hover:bg-slate-800 transition-all text-slate-300"
                >
                  <div className="flex items-center gap-1.5">
                    <span className={isSente ? 'text-amber-400' : 'text-indigo-400'}>
                      {isSente ? '▲' : '△'}
                    </span>
                    <span className="font-bold">{next.move.kifString}</span>
                    <span
                      className={`text-[10px] px-1 py-0.5 rounded ${
                        next.isMainline
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {next.isMainline ? t('tree.mainline') : t('tree.variation', { index: idx })}
                    </span>
                  </div>

                  <span className="text-[11px] font-mono text-slate-400">
                    {next.gameCount}局 ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!tree && (
        <div className="p-8 text-center text-xs text-slate-500">
          {t('library.empty_desc')}
        </div>
      )}
    </div>
  );
};
