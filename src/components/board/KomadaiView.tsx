/**
 * Compact Komadai (Piece Stand) Component.
 * Displays captured pieces with wooden mini-tiles, red count badges (matching ShogiGUI/Kento reference),
 * and compact single-line layout to guarantee 1-screen fit.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import React from 'react';
import { Color } from '../../types/shogi';
import { getPieceSpriteCoords } from './pieceSprites';
import { useBoardAppearance } from '../../hooks/useBoardAppearance';

export interface KomadaiViewProps {
  color: Color;
  playerName: string;
  isTurn: boolean;
  hand: Record<string, number>;
  selectedPiece?: string | null;
  hintPiece?: string | null;
  isHinted?: boolean;
  onPieceSelect?: (pieceKey: string) => void;
  selectable?: boolean;
}

const DISPLAY_ORDER = ['R', 'B', 'G', 'S', 'N', 'L', 'P'];

export const KomadaiView: React.FC<KomadaiViewProps> = ({
  color,
  playerName,
  isTurn,
  hand,
  selectedPiece,
  hintPiece,
  isHinted = false,
  onPieceSelect,
  selectable = false,
}) => {
  const { pieceSpriteHref } = useBoardAppearance();
  const isBlack = color === 'b';
  const prefix = isBlack ? '▲' : '△';

  const heldPieces = DISPLAY_ORDER.filter((key) => (hand[key] ?? 0) > 0);

  return (
    <div
      className={`flex items-center justify-between px-3 py-1 rounded-lg border transition-all h-[40px] shadow-md ${
        isHinted
          ? 'bg-gradient-to-r from-purple-950/80 via-indigo-950/70 to-purple-950/80 border-purple-400 shadow-purple-500/40 ring-2 ring-purple-400/80 animate-pulse'
          : isTurn
          ? 'bg-gradient-to-r from-amber-950/50 via-slate-900 to-amber-950/40 border-amber-500/70 shadow-amber-950/40 ring-1 ring-amber-500/30'
          : 'bg-gradient-to-r from-slate-900/95 via-slate-900/90 to-slate-900/95 border-amber-950/40'
      }`}
    >
      {/* Player Identity & Turn Indicator */}
      <div className="flex items-center gap-2 min-w-0 pr-2">
        <span
          className={`text-xs font-bold font-mono ${
            isBlack ? 'text-amber-400' : 'text-indigo-400'
          }`}
        >
          {prefix}
        </span>
        <span className="text-xs font-semibold text-slate-100 truncate max-w-[130px] sm:max-w-[160px]">
          {playerName}
        </span>
        {isTurn && !isHinted && (
          <span className="flex h-2 w-2 relative shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
        )}
        {isHinted && (
          <span className="text-[10px] bg-purple-500/30 text-purple-200 border border-purple-400/50 px-1.5 py-0.2 rounded font-bold animate-pulse shrink-0">
            ✋ 駒台
          </span>
        )}
      </div>

      {/* Captured Pieces with Authentic Mini-Tiles & Red Count Badges */}
      <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto py-0.5">
        {heldPieces.length === 0 ? (
          <span className="text-[11px] text-slate-600 font-mono px-1">-</span>
        ) : (
          heldPieces.map((key) => {
            const count = hand[key] ?? 0;
            const isSelected = selectedPiece === key;
            const isPieceHinted = hintPiece === key;
            const { col, row } = getPieceSpriteCoords(key, false);
            return (
              <button
                type="button"
                key={key}
                disabled={!selectable}
                onClick={() => selectable && onPieceSelect?.(key)}
                className={`relative inline-flex items-center justify-center w-[28px] h-[30px] rounded p-0.5 select-none transition-transform ${
                  selectable ? 'cursor-pointer hover:scale-105 active:scale-95' : 'cursor-default'
                } ${
                  isSelected
                    ? 'ring-2 ring-emerald-400 scale-110 shadow-lg shadow-emerald-500/40'
                    : isPieceHinted
                    ? 'ring-2 ring-emerald-400 scale-110 shadow-lg shadow-emerald-500/50 animate-pulse'
                    : ''
                }`}
              >
                <svg
                  className="w-full h-full drop-shadow"
                  viewBox={`${col * 35} ${row * 37} 35 37`}
                >
                  <image
                    href={pieceSpriteHref}
                    x="0"
                    y="0"
                    width="280"
                    height="148"
                  />
                </svg>
                {count > 1 && (
                  <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-0.5 rounded-full bg-red-600 text-white font-mono text-[9px] font-black flex items-center justify-center shadow ring-1 ring-white/60">
                    {count}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
