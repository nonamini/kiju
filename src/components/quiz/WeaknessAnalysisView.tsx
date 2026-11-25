/**
 * Weakness Analysis View Component.
 * Aggregates and displays recurring divergence points and loss positions from sparring.
 * Enables one-click tactical drilling on user weaknesses.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WeaknessPosition } from '../../types/weakness';
import { ShogiBoard } from '../../utils/shogiBoard';
import { parseUsiMove, formatShogiMove } from '../../utils/shogiRules';
import { ShogiBoardView } from '../board/ShogiBoardView';
import { Square } from '../../types/shogi';

export interface WeaknessAnalysisViewProps {
  positions: WeaknessPosition[];
  onStartDrill: (position: WeaknessPosition) => void;
  className?: string;
}

/**
 * Formats a USI move in the context of the position's board.
 */
function formatMoveInPosition(
  sfen: string,
  usiMoves: string[],
  moveUsi: string,
  ply: number,
  side: 'b' | 'w'
): string {
  try {
    const board = ShogiBoard.fromSfen(sfen);
    let prevTo: Square | undefined;
    for (let i = 0; i < usiMoves.length; i++) {
      const usi = usiMoves[i];
      if (!usi) continue;
      const parsed = parseUsiMove(usi, board, i + 1, board.getTurn(), prevTo);
      if (parsed) {
        board.applyMove(parsed);
        prevTo = parsed.to;
      }
    }
    const move = parseUsiMove(moveUsi, board, ply, side, prevTo);
    if (move) {
      return formatShogiMove(move);
    }
  } catch {
    // Fallback to raw USI if parsing fails
  }
  const prefix = side === 'b' ? '▲' : '△';
  return `${prefix}${moveUsi}`;
}

export const WeaknessAnalysisView: React.FC<WeaknessAnalysisViewProps> = ({
  positions,
  onStartDrill,
  className = '',
}) => {
  const { t } = useTranslation();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [selectedOpening, setSelectedOpening] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'losses' | 'recent'>('losses');

  // Extract unique opening names for filter dropdown
  const openings = useMemo(() => {
    const map = new Map<string, string>();
    positions.forEach((p) => {
      map.set(p.openingId, p.openingName || p.openingId);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [positions]);

  // Filter and sort positions
  const filteredPositions = useMemo(() => {
    let list = [...positions];
    if (selectedOpening !== 'all') {
      list = list.filter((p) => p.openingId === selectedOpening);
    }
    if (sortBy === 'losses') {
      list.sort((a, b) => b.lossCount - a.lossCount);
    } else {
      list.sort((a, b) => new Date(b.lastLossAt).getTime() - new Date(a.lastLossAt).getTime());
    }
    return list;
  }, [positions, selectedOpening, sortBy]);

  // Reconstructed board for active preview
  const activePreviewBoard = useMemo(() => {
    if (!previewId) return null;
    const target = positions.find((p) => p.id === previewId);
    if (!target) return null;

    const board = ShogiBoard.fromSfen(target.sfen);
    let prevTo: Square | undefined;
    for (let i = 0; i < target.usiMovesToPosition.length; i++) {
      const usi = target.usiMovesToPosition[i];
      if (!usi) continue;
      const parsed = parseUsiMove(usi, board, i + 1, board.getTurn(), prevTo);
      if (parsed) {
        board.applyMove(parsed);
        prevTo = parsed.to;
      }
    }
    return { board, isFlipped: target.playerColor === 'w' };
  }, [positions, previewId]);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header ribbon */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-xl border border-rose-500/20 bg-rose-950/20">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">⚠️</span>
            <h3 className="font-bold text-slate-100 text-base sm:text-lg">
              {t('weakness.title')}
            </h3>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
              {t('weakness.summary', { count: positions.length })}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            {t('weakness.subtitle')}
          </p>
        </div>

        {/* Filter & Sort Controls */}
        <div className="flex items-center gap-2">
          {openings.length > 1 && (
            <select
              value={selectedOpening}
              onChange={(e) => setSelectedOpening(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-xs rounded-lg px-2.5 py-1.5 text-slate-300 focus:outline-none focus:border-rose-500"
            >
              <option value="all">{t('weakness.filter.all_openings')}</option>
              {openings.map((op) => (
                <option key={op.id} value={op.id}>
                  {op.name}
                </option>
              ))}
            </select>
          )}

          <div className="flex rounded-lg bg-slate-900 border border-slate-700 p-0.5 text-xs">
            <button
              onClick={() => setSortBy('losses')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                sortBy === 'losses'
                  ? 'bg-rose-500/30 text-rose-300 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('weakness.filter.min_losses')}
            </button>
            <button
              onClick={() => setSortBy('recent')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                sortBy === 'recent'
                  ? 'bg-rose-500/30 text-rose-300 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('weakness.filter.recent')}
            </button>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {filteredPositions.length === 0 && (
        <div className="text-center py-12 px-4 rounded-xl border border-slate-800 bg-slate-900/50">
          <span className="text-3xl block mb-2">🎯</span>
          <p className="text-sm text-slate-400">{t('weakness.empty')}</p>
        </div>
      )}

      {/* Weakness Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredPositions.map((item) => {
          const playedFormatted = formatMoveInPosition(
            item.sfen,
            item.usiMovesToPosition,
            item.playedMoveUsi,
            item.ply,
            item.playerColor
          );

          const bookFormatted =
            item.bookMovesUsi.length > 0
              ? item.bookMovesUsi
                  .map((b) =>
                    formatMoveInPosition(
                      item.sfen,
                      item.usiMovesToPosition,
                      b,
                      item.ply,
                      item.playerColor
                    )
                  )
                  .join(', ')
              : t('weakness.card.no_book_moves');

          const isPreviewing = previewId === item.id;

          return (
            <div
              key={item.id}
              className={`flex flex-col justify-between p-4 rounded-xl border transition-all ${
                isPreviewing
                  ? 'border-rose-500/60 bg-slate-900/90 ring-1 ring-rose-500/40 shadow-lg'
                  : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
              }`}
            >
              {/* Card Top: Opening, Ply, Badges */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">
                      {item.openingName || item.openingId}
                    </span>
                    <span className="text-xs font-medium text-slate-400">
                      {t('weakness.card.ply', { ply: item.ply })}
                    </span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        item.playerColor === 'b'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      {item.playerColor === 'b' ? t('board.sente') : t('board.gote')}
                    </span>
                  </div>

                  <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    <span>🔥</span>
                    <span>{t('weakness.card.losses', { count: item.lossCount })}</span>
                  </span>
                </div>

                {/* Move Comparison: Divergence vs Book */}
                <div className="mt-3 space-y-2 text-xs">
                  <div className="flex items-start justify-between p-2 rounded bg-rose-950/30 border border-rose-500/20">
                    <span className="text-rose-400 font-medium">
                      {t('weakness.card.played_label')}:
                    </span>
                    <span className="font-bold text-rose-200">{playedFormatted}</span>
                  </div>

                  <div className="flex items-start justify-between p-2 rounded bg-emerald-950/30 border border-emerald-500/20">
                    <span className="text-emerald-400 font-medium">
                      {t('weakness.card.book_label')}:
                    </span>
                    <span className="font-bold text-emerald-200">{bookFormatted}</span>
                  </div>
                </div>

                {/* Optional Mini-board Preview */}
                {isPreviewing && activePreviewBoard && (
                  <div className="mt-4 p-2 bg-slate-950 rounded-lg border border-slate-800 flex justify-center animate-fadeIn">
                    <div className="w-56">
                      <ShogiBoardView
                        board={activePreviewBoard.board}
                        isFlipped={activePreviewBoard.isFlipped}
                        className="w-full"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Card Footer: Date & Action Buttons */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500">
                  {t('weakness.card.last_loss', {
                    date: item.lastLossAt ? item.lastLossAt.slice(0, 10) : '-',
                  })}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPreviewId(isPreviewing ? null : item.id)}
                    className="px-2.5 py-1 text-xs rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                  >
                    {t('weakness.card.preview_btn')}
                  </button>

                  <button
                    onClick={() => onStartDrill(item)}
                    className="px-3 py-1 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-500 text-white shadow-sm hover:shadow-rose-600/30 transition-all flex items-center gap-1.5"
                  >
                    {t('weakness.card.drill_btn')}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
