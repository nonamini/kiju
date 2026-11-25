/**
 * Branch Selector Component (Variation Pills).
 * Displays candidate moves at branching junctions, allowing seamless switching
 * between mainline and alternative repertoire variations.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { KifuTreeNode } from '../../types/tree';

export interface BranchSelectorProps {
  currentPly: number;
  candidateMoves: KifuTreeNode[];
  activeNodeId?: string;
  totalGames: number;
  onSelectBranch: (node: KifuTreeNode) => void;
}

export const BranchSelector: React.FC<BranchSelectorProps> = ({
  currentPly,
  candidateMoves,
  activeNodeId,
  totalGames,
  onSelectBranch,
}) => {
  const { t } = useTranslation();

  if (candidateMoves.length <= 1) {
    return null;
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 space-y-2">
      {/* Header Info */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 font-semibold text-amber-400">
          <span>🔀</span>
          <span>{t('tree.branch_selector')}</span>
          <span className="text-slate-400 font-normal">
            ({t('board.ply_count', { current: currentPly, total: candidateMoves.length })})
          </span>
        </div>
        <span className="text-[11px] text-slate-400 font-mono">
          {t('tree.branch_count', { count: candidateMoves.length })}
        </span>
      </div>

      {/* Candidate Pills */}
      <div className="flex flex-wrap gap-1.5">
        {candidateMoves.map((node, idx) => {
          const isSelected = node.id === activeNodeId;
          const adoptionPct =
            totalGames > 0 ? Math.round((node.gameCount / totalGames) * 100) : 0;
          const isSente = node.move.color === 'b';

          return (
            <button
              key={node.id}
              type="button"
              onClick={() => onSelectBranch(node)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-all ${
                isSelected
                  ? 'border-amber-500 bg-amber-500/20 text-amber-200 shadow-sm shadow-amber-950/50 ring-1 ring-amber-500/40'
                  : 'border-slate-800 bg-slate-900/80 text-slate-300 hover:border-slate-700 hover:bg-slate-800 hover:text-slate-100'
              }`}
            >
              {/* Turn & Move notation */}
              <span className="font-bold">
                <span className={isSente ? 'text-amber-400' : 'text-indigo-400'}>
                  {isSente ? '▲' : '△'}
                </span>{' '}
                {node.move.kifString}
              </span>

              {/* Mainline / Variation Tag */}
              <span
                className={`text-[10px] px-1 py-0.2 rounded font-medium ${
                  node.isMainline
                    ? 'bg-amber-950 text-amber-300 border border-amber-800'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {node.isMainline ? t('tree.mainline') : t('tree.variation', { index: idx })}
              </span>

              {/* Adoption Stats */}
              <span className="text-[10px] font-mono text-slate-400">
                {node.gameCount}局 ({adoptionPct}%)
              </span>

              {/* Active check indicator */}
              {isSelected && (
                <span className="text-[10px] text-emerald-400 font-bold ml-0.5">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
