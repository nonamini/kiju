/**
 * Board Controller & Navigation Component.
 * Supports ply stepping, keyboard arrow keys, Home/End, and board flip toggle.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ShogiMove } from '../../types/shogi';

export interface BoardControllerProps {
  currentPly: number;
  totalPly: number;
  currentMove?: ShogiMove;
  isFlipped: boolean;
  onFirstPly: () => void;
  onPrevPly: () => void;
  onNextPly: () => void;
  onLastPly: () => void;
  onFlipToggle: () => void;
}

export const BoardController: React.FC<BoardControllerProps> = ({
  currentPly,
  totalPly,
  currentMove,
  isFlipped,
  onFirstPly,
  onPrevPly,
  onNextPly,
  onLastPly,
  onFlipToggle,
}) => {
  const { t } = useTranslation();

  // Global Keyboard shortcuts: Left/Right arrows, Home/End
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Do not trigger if typing in an input or textarea
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onPrevPly();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onNextPly();
      } else if (e.key === 'Home') {
        e.preventDefault();
        onFirstPly();
      } else if (e.key === 'End') {
        e.preventDefault();
        onLastPly();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onFirstPly, onLastPly, onNextPly, onPrevPly]);

  const canGoPrev = currentPly > 0;
  const canGoNext = currentPly < totalPly;

  return (
    <div className="flex flex-col gap-1.5 pt-1">
      {/* Move Info Bar */}
      <div className="flex items-center justify-between px-1 text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <span className="font-mono text-amber-400 font-bold">
            {t('board.ply_count', { current: currentPly, total: totalPly })}
          </span>
          {currentMove && (
            <span className="font-medium text-slate-100 bg-slate-800/90 px-2 py-0.5 rounded border border-slate-700 font-mono text-[11px]">
              {currentMove.color === 'b' ? '▲' : '△'} {currentMove.kifString}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onFlipToggle}
          className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors text-[11px]"
          title={t('board.flip')}
        >
          <span>⟲</span>
          <span>{isFlipped ? t('board.gote_view') : t('board.sente_view')}</span>
        </button>
      </div>

      {/* Button Controls */}
      <div className="grid grid-cols-4 gap-1.5">
        <button
          type="button"
          onClick={onFirstPly}
          disabled={!canGoPrev}
          className="py-1.5 text-xs font-medium rounded bg-slate-800/90 hover:bg-slate-700 disabled:opacity-35 disabled:cursor-not-allowed text-slate-200 border border-slate-700/80 transition active:scale-[0.98]"
        >
          |&lt;&lt; {t('board.first_ply')}
        </button>
        <button
          type="button"
          onClick={onPrevPly}
          disabled={!canGoPrev}
          className="py-1.5 text-xs font-medium rounded bg-slate-800/90 hover:bg-slate-700 disabled:opacity-35 disabled:cursor-not-allowed text-slate-200 border border-slate-700/80 transition active:scale-[0.98]"
        >
          &lt; {t('board.prev_ply')}
        </button>
        <button
          type="button"
          onClick={onNextPly}
          disabled={!canGoNext}
          className="py-1.5 text-xs font-medium rounded bg-slate-800/90 hover:bg-slate-700 disabled:opacity-35 disabled:cursor-not-allowed text-slate-200 border border-slate-700/80 transition active:scale-[0.98]"
        >
          {t('board.next_ply')} &gt;
        </button>
        <button
          type="button"
          onClick={onLastPly}
          disabled={!canGoNext}
          className="py-1.5 text-xs font-medium rounded bg-slate-800/90 hover:bg-slate-700 disabled:opacity-35 disabled:cursor-not-allowed text-slate-200 border border-slate-700/80 transition active:scale-[0.98]"
        >
          {t('board.last_ply')} &gt;&gt;|
        </button>
      </div>
    </div>
  );
};
