/**
 * Move Breadcrumb & Tape Component.
 * Displays interactive timeline path from initial position to current leaf,
 * allowing single-click jumping to any ply and highlighting branching junctures.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { KifuTreeNode } from '../../types/tree';

export interface MoveBreadcrumbBarProps {
  currentPly: number;
  activePath: KifuTreeNode[];
  onSelectPly: (ply: number) => void;
}

export const MoveBreadcrumbBar: React.FC<MoveBreadcrumbBarProps> = ({
  currentPly,
  activePath,
  onSelectPly,
}) => {
  const { t } = useTranslation();
  const activeItemRef = useRef<HTMLButtonElement | null>(null);

  // Auto-scroll the active move into view horizontally
  useEffect(() => {
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [currentPly]);

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto py-1 px-1.5 bg-slate-950/60 rounded-lg border border-slate-800 text-xs select-none scrollbar-thin">
      {/* Starting Position (Ply 0) */}
      <button
        type="button"
        onClick={() => onSelectPly(0)}
        ref={currentPly === 0 ? activeItemRef : null}
        className={`shrink-0 px-2 py-1 rounded transition-colors font-medium text-[11px] ${
          currentPly === 0
            ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
            : 'bg-slate-900/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
        }`}
      >
        {t('board.first_ply')}
      </button>

      {/* Path Moves */}
      {activePath.map((node, idx) => {
        const ply = idx + 1;
        const isSelected = currentPly === ply;
        const isSente = node.move.color === 'b';
        const hasSiblingBranch = (node.children?.length ?? 0) > 1;

        return (
          <button
            key={node.id}
            type="button"
            onClick={() => onSelectPly(ply)}
            ref={isSelected ? activeItemRef : null}
            className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded transition-all font-mono text-[11px] ${
              isSelected
                ? 'bg-amber-500 text-slate-950 font-bold shadow-sm scale-105'
                : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <span className="opacity-70">{ply}.</span>
            <span>{isSente ? '▲' : '△'}</span>
            <span>{node.move.kifString}</span>
            {hasSiblingBranch && (
              <span
                className={`text-[9px] px-1 rounded-full ${
                  isSelected ? 'bg-amber-900 text-amber-100' : 'bg-slate-800 text-amber-400'
                }`}
                title="Branch"
              >
                🔀
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
