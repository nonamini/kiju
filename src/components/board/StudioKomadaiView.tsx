/**
 * Studio Komadai (Piece Stand) Component.
 * Renders captured pieces with authentic Tsuge wood piece vector sprites from piece_wood.svg.
 * Fully responsive and compact.
 * Follows Rule 1: strictly English identifiers, comments, and types.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { getPieceSpriteCoords } from './pieceSprites';
import { useBoardAppearance } from '../../hooks/useBoardAppearance';

export interface StudioKomadaiViewProps {
  color: 0 | 1; // 0: Sente (Black), 1: Gote (White)
  playerName: string;
  isTurn?: boolean;
  hands: Record<string, number>; // pieceKind -> count (e.g. { FU: 2, GI: 1 })
  selectedPiece?: string | null;
  onPieceSelect?: (pieceKind: string) => void;
  onStandClick?: () => void;
  isDropTarget?: boolean;
  selectable?: boolean;
  timeRemaining?: string;
  byoyomiSeconds?: number;
  className?: string;
  // Match Action Hooks for Player (Kifu sheet, Hint, Resign)
  isHumanPlayer?: boolean;
  onViewKifuSheet?: () => void;
  onHint?: () => void;
  onResign?: () => void;
  isFlippedPlayer?: boolean; // When true (e.g. Gote facing opposite), display actions rotated 180
  isFlippedBoard?: boolean; // When board is flipped, viewer perspective is reversed (Gote pieces upright at bottom)
}

const DISPLAY_ORDER = ['HI', 'KA', 'KI', 'GI', 'KE', 'KY', 'FU'];

export const StudioKomadaiView: React.FC<StudioKomadaiViewProps> = ({
  color,
  playerName,
  isTurn = false,
  hands,
  selectedPiece,
  onPieceSelect,
  onStandClick,
  isDropTarget = false,
  selectable = true,
  timeRemaining,
  byoyomiSeconds,
  className = '',
  isHumanPlayer = false,
  onViewKifuSheet,
  onHint,
  onResign,
  isFlippedPlayer = false,
  isFlippedBoard = false,
}) => {
  const { t } = useTranslation();
  const { pieceSpriteHref } = useBoardAppearance();
  const isSente = color === 0;
  const prefix = isSente ? '▲' : '△';
  const availableKinds = DISPLAY_ORDER.filter((k) => (hands[k] ?? 0) > 0);

  return (
    <div
      onClick={() => onStandClick?.()}
      className={`flex items-center justify-between px-3 py-1.5 rounded-lg border transition-all h-[44px] shadow-md ${
        isDropTarget
          ? 'bg-amber-950/40 border-amber-400/80 ring-1 ring-amber-400/50 cursor-pointer'
          : isTurn
            ? 'bg-gradient-to-r from-amber-950/60 via-slate-900 to-amber-950/50 border-amber-500/70 shadow-amber-950/50 ring-1 ring-amber-500/40'
            : 'bg-gradient-to-r from-slate-900/95 via-slate-900/90 to-slate-900/95 border-amber-950/40'
      } ${className}`}
    >
      {/* If isFlippedPlayer (top komadai), align right so it doesn't get clipped */}
      <div className={`flex items-center w-full justify-between gap-2 min-w-0 ${isFlippedPlayer ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Player Info & Actions Area */}
        <div className={`flex items-center gap-2 min-w-0 ${isFlippedPlayer ? 'rotate-180' : ''}`}>
          <span
            className={`text-sm font-bold font-mono ${
              isSente ? 'text-amber-400' : 'text-sky-400'
            }`}
          >
            {prefix}
          </span>
          <span className="text-xs font-semibold text-slate-100 truncate max-w-[140px] sm:max-w-[200px]">
            {playerName}
          </span>

          {isTurn && (
            <span className="flex h-2 w-2 relative shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          )}

          {/* Action Controls for Human Players (Kifu sheet, Hint, Resign) */}
          {isHumanPlayer && (
            <div className="flex items-center gap-1 ml-1 bg-slate-950/60 px-1 py-0.5 rounded border border-slate-800 shrink-0">
              {onViewKifuSheet && (
                <button
                  type="button"
                  onClick={onViewKifuSheet}
                  disabled={!isTurn}
                  className="p-1 rounded hover:bg-slate-800 text-amber-300 disabled:opacity-30 transition text-xs leading-none"
                  title={t('studio.komadai.view_kifu_sheet_title', '棋譜用紙を見る')}
                >
                  📜
                </button>
              )}
              {onHint && (
                <button
                  type="button"
                  onClick={onHint}
                  disabled={!isTurn}
                  className="p-1 rounded hover:bg-slate-800 text-amber-300 disabled:opacity-30 transition text-xs leading-none"
                  title={t('studio.komadai.view_hint_title', 'ヒントを見る')}
                >
                  💡
                </button>
              )}
              {onResign && (
                <button
                  type="button"
                  onClick={onResign}
                  className="p-1 rounded hover:bg-rose-950/70 text-rose-400 transition text-xs leading-none"
                  title={t('studio.komadai.resign_title', '投了する')}
                >
                  🏳️
                </button>
              )}
            </div>
          )}

          {/* Digital Clock Display */}
          {timeRemaining && (
            <span className="text-[11px] font-mono font-bold bg-black/40 text-amber-200/90 px-1.5 py-0.5 rounded border border-amber-500/30 shrink-0">
              {timeRemaining}
              {byoyomiSeconds !== undefined && byoyomiSeconds > 0 && (
                <span className="ml-1 text-red-400">({byoyomiSeconds}s)</span>
              )}
            </span>
          )}
        </div>

        {/* Captured Pieces with authentic boxwood SVG tiles */}
        <div className={`flex items-center gap-1.5 shrink-0 overflow-x-auto py-0.5 ${isFlippedPlayer ? 'flex-row-reverse' : ''}`}>
          {availableKinds.length === 0 ? (
            <span className="text-[11px] text-slate-600 font-mono px-1">-</span>
          ) : (
            availableKinds.map((kind) => {
              const count = hands[kind] ?? 0;
              const isSelected = selectedPiece === kind;
              // If board is flipped, viewer perspective is reversed:
              // Bottom player (Gote) sees pieces upright (not upside down), while top player (Sente) is inverted.
              const isSpriteUpsideDown = isFlippedBoard ? isSente : !isSente;
              const { col, row } = getPieceSpriteCoords(kind, isSpriteUpsideDown);

              return (
                <button
                  type="button"
                  key={kind}
                  disabled={!selectable}
                  onClick={(e) => {
                    if (selectable && onPieceSelect) {
                      e.stopPropagation();
                      onPieceSelect(kind);
                    }
                  }}
                  className={`relative inline-flex items-center justify-center w-[28px] h-[30px] rounded p-0.5 transition-transform ${
                    selectable ? 'cursor-pointer hover:scale-105 active:scale-95' : 'cursor-default'
                  } ${
                    isSelected
                      ? 'ring-2 ring-emerald-400 scale-110 shadow-lg shadow-emerald-500/40'
                      : ''
                  }`}
                >
                  {/* Scaled piece sprite thumbnail */}
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

                  {/* Multiple count badge */}
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
    </div>
  );
};
