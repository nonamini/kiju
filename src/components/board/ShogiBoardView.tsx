/**
 * Responsive SVG Shogi Board Component.
 * Unified with StudioShogiBoardView visuals: Kaya SVG base + bespoke vector palettes
 * (wood, dark, slate) + custom board image, and piece sprite sheets
 * (single-kanji standard, carved 2-kanji, or custom sprite).
 * Preserves move/hint square highlights, target indicators, and directional arrows.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import React, { useId } from 'react';
import { ShogiMove, Square } from '../../types/shogi';
import { ShogiBoard } from '../../utils/shogiBoard';
import { getPieceSpriteCoords } from './pieceSprites';
import {
  BOARD_HEIGHT,
  BOARD_RANK_LABELS,
  BOARD_RANK_LABELS_FLIPPED,
  BOARD_WIDTH,
  CELL_H,
  CELL_W,
  GRID_START_X,
  GRID_START_Y,
  VIEW_HEIGHT,
  VIEW_MIN_X,
  VIEW_MIN_Y,
  VIEW_WIDTH,
  useBoardAppearance,
} from '../../hooks/useBoardAppearance';

export interface ShogiBoardViewProps {
  board: ShogiBoard;
  isFlipped: boolean;
  lastMove?: ShogiMove;
  showLastMoveArrow?: boolean;
  selectedSquare?: Square | null;
  targetSquares?: Square[];
  hintSquares?: Square[];
  hintRankSquares?: Square[];
  hintFileSquares?: Square[];
  hintPieceSquares?: Square[];
  hintArrow?: { from?: Square; to: Square } | null;
  onSquareClick?: (square: Square) => void;
  className?: string;
}

export const ShogiBoardView: React.FC<ShogiBoardViewProps> = ({
  board,
  isFlipped,
  lastMove,
  showLastMoveArrow = false,
  selectedSquare,
  targetSquares,
  hintSquares,
  hintRankSquares,
  hintFileSquares,
  hintPieceSquares,
  hintArrow,
  onSquareClick,
  className = '',
}) => {
  const rawUid = useId();
  const safeUid = rawUid.replace(/:/g, '_');
  const boardGradId = `shogi-board-grad-${safeUid}`;
  const hintArrowId = `hint-arrow-${safeUid}`;
  const lastMoveArrowId = `last-move-arrow-${safeUid}`;

  const {
    showCoordinates,
    vectorPalette,
    boardImageHref,
    pieceSpriteHref,
  } = useBoardAppearance();

  const getCellX = (file: number): number => {
    const colIndex = isFlipped ? file - 1 : 9 - file;
    return GRID_START_X + colIndex * CELL_W;
  };

  const getCellY = (rank: number): number => {
    const rowIndex = isFlipped ? 9 - rank : rank - 1;
    return GRID_START_Y + rowIndex * CELL_H;
  };

  const isHeightDriven = className.includes('h-full');

  return (
    <div
      className={`relative flex items-center justify-center select-none shadow-2xl rounded-sm ${
        isHeightDriven ? '' : 'w-full max-h-full'
      } ${className}`}
      style={isHeightDriven ? { aspectRatio: `${VIEW_WIDTH} / ${VIEW_HEIGHT}` } : undefined}
    >
      <svg
        viewBox={`${VIEW_MIN_X} ${VIEW_MIN_Y} ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        className={`max-w-full max-h-full rounded-sm ${
          isHeightDriven ? 'w-full h-full' : 'w-full h-auto'
        }`}
        style={isHeightDriven ? undefined : { aspectRatio: `${VIEW_WIDTH} / ${VIEW_HEIGHT}` }}
      >
        <defs>
          {vectorPalette && (
            <linearGradient id={boardGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={vectorPalette.gradStart} />
              <stop offset="100%" stopColor={vectorPalette.gradEnd} />
            </linearGradient>
          )}

          {/* Answer Hint Arrow Marker */}
          <marker
            id={hintArrowId}
            markerWidth="7"
            markerHeight="7"
            refX="5"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 7 3.5, 0 7" fill="#fbbf24" />
          </marker>

          {/* Last Move Directional Arrow Marker */}
          <marker
            id={lastMoveArrowId}
            markerWidth="7"
            markerHeight="7"
            refX="5"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 7 3.5, 0 7" fill="#0284c7" />
          </marker>
        </defs>

        {/* Layer 1: Board Surface (Kaya SVG, Custom Image, or Bespoke Vector Theme) */}
        {vectorPalette ? (
          <g>
            <rect
              x="0"
              y="0"
              width={BOARD_WIDTH}
              height={BOARD_HEIGHT}
              rx="2"
              fill={`url(#${boardGradId})`}
              stroke={vectorPalette.outerStroke}
              strokeWidth="2"
            />
            <rect
              x={GRID_START_X}
              y={GRID_START_Y}
              width={CELL_W * 9}
              height={CELL_H * 9}
              fill="none"
              stroke={vectorPalette.lineStroke}
              strokeWidth="1.8"
            />
            {Array.from({ length: 8 }).map((_, idx) => {
              const step = idx + 1;
              const vx = GRID_START_X + step * CELL_W;
              const hy = GRID_START_Y + step * CELL_H;
              return (
                <React.Fragment key={`grid-${step}`}>
                  <line
                    x1={vx}
                    y1={GRID_START_Y}
                    x2={vx}
                    y2={GRID_START_Y + CELL_H * 9}
                    stroke={vectorPalette.lineStroke}
                    strokeWidth="1"
                  />
                  <line
                    x1={GRID_START_X}
                    y1={hy}
                    x2={GRID_START_X + CELL_W * 9}
                    y2={hy}
                    stroke={vectorPalette.lineStroke}
                    strokeWidth="1"
                  />
                </React.Fragment>
              );
            })}
            {[3, 6].flatMap((col) =>
              [3, 6].map((row) => (
                <circle
                  key={`hoshi-${col}-${row}`}
                  cx={GRID_START_X + col * CELL_W}
                  cy={GRID_START_Y + row * CELL_H}
                  r="2.6"
                  fill={vectorPalette.lineStroke}
                />
              ))
            )}
          </g>
        ) : (
          <image
            href={boardImageHref}
            x="0"
            y="0"
            width={BOARD_WIDTH}
            height={BOARD_HEIGHT}
            preserveAspectRatio="none"
          />
        )}

        {/* Layer 2: Square Highlights & Target Dots */}
        {Array.from({ length: 9 }).map((_, rankIdx) => {
          const rank = rankIdx + 1;
          return Array.from({ length: 9 }).map((_, fileIdx) => {
            const file = 9 - fileIdx;
            const x = getCellX(file);
            const y = getCellY(rank);

            const isFrom =
              lastMove?.from &&
              lastMove.from.file === file &&
              lastMove.from.rank === rank;

            const isTo =
              lastMove?.to &&
              lastMove.to.file === file &&
              lastMove.to.rank === rank;

            const isSelected =
              selectedSquare &&
              selectedSquare.file === file &&
              selectedSquare.rank === rank;

            const isTarget =
              targetSquares?.some((s) => s.file === file && s.rank === rank) ?? false;

            const isHint =
              hintSquares?.some((s) => s.file === file && s.rank === rank) ?? false;
            const isHintPiece =
              hintPieceSquares?.some((s) => s.file === file && s.rank === rank) ?? false;
            const isHintRank =
              hintRankSquares?.some((s) => s.file === file && s.rank === rank) ?? false;
            const isHintFile =
              hintFileSquares?.some((s) => s.file === file && s.rank === rank) ?? false;

            const pieceAtSquare = typeof board?.getSquare === 'function' ? board.getSquare(file, rank) : null;

            let squareFill = 'none';
            let strokeColor = 'none';
            let strokeW = 0;

            if (isSelected) {
              squareFill = 'rgba(16, 185, 129, 0.45)';
              strokeColor = '#059669';
              strokeW = 2;
            } else if (isTarget) {
              if (pieceAtSquare) {
                squareFill = 'rgba(239, 68, 68, 0.38)';
                strokeColor = '#dc2626';
                strokeW = 1.8;
              } else {
                squareFill = 'rgba(16, 185, 129, 0.18)';
                strokeColor = '#10b981';
                strokeW = 1.4;
              }
            } else if (isHint) {
              squareFill = 'rgba(168, 85, 247, 0.42)';
              strokeColor = '#a855f7';
              strokeW = 2.2;
            } else if (isHintPiece) {
              squareFill = 'rgba(16, 185, 129, 0.28)';
              strokeColor = '#10b981';
              strokeW = 2.0;
            } else if (isTo) {
              squareFill = 'rgba(56, 189, 248, 0.38)';
              strokeColor = '#0284c7';
              strokeW = 1.5;
            } else if (isFrom) {
              squareFill = 'rgba(245, 158, 11, 0.35)';
              strokeColor = '#d97706';
              strokeW = 1.2;
            } else if (isHintRank && isHintFile) {
              squareFill = 'rgba(168, 85, 247, 0.24)';
              strokeColor = '#a855f7';
              strokeW = 1.2;
            } else if (isHintRank) {
              squareFill = 'rgba(99, 102, 241, 0.14)';
              strokeColor = 'rgba(99, 102, 241, 0.35)';
              strokeW = 0.8;
            } else if (isHintFile) {
              squareFill = 'rgba(14, 165, 233, 0.14)';
              strokeColor = 'rgba(14, 165, 233, 0.35)';
              strokeW = 0.8;
            }

            if (squareFill === 'none' && !(isTarget && !pieceAtSquare)) {
              return null;
            }

            return (
              <g key={`sq-${file}-${rank}`} className="pointer-events-none">
                {squareFill !== 'none' && (
                  <rect
                    x={x}
                    y={y}
                    width={CELL_W}
                    height={CELL_H}
                    fill={squareFill}
                    stroke={strokeColor}
                    strokeWidth={strokeW}
                  />
                )}
                {isTarget && !pieceAtSquare && (
                  <circle
                    cx={x + CELL_W / 2}
                    cy={y + CELL_H / 2}
                    r={CELL_W * 0.16}
                    fill="rgba(16, 185, 129, 0.85)"
                    stroke="#fff"
                    strokeWidth="1.5"
                  />
                )}
              </g>
            );
          });
        })}

        {/* Layer 3: Pieces on Board (Sprite Sheet) */}
        {Array.from({ length: 9 }).map((_, rankIdx) => {
          const rank = rankIdx + 1;
          return Array.from({ length: 9 }).map((_, fileIdx) => {
            const file = 9 - fileIdx;
            const piece = typeof board?.getSquare === 'function' ? board.getSquare(file, rank) : null;
            if (!piece) return null;

            const isSentePiece = piece === piece.toUpperCase();
            const isGote = !isSentePiece;
            const { col, row } = getPieceSpriteCoords(piece, isGote);

            const x = getCellX(file);
            const y = getCellY(rank);

            const pieceRenderW = CELL_W * 0.90;
            const pieceRenderH = pieceRenderW * (37 / 35);
            const offsetX = x + (CELL_W - pieceRenderW) / 2;
            const offsetY = y + (CELL_H - pieceRenderH) / 2;

            const rotateDeg = isFlipped ? 180 : 0;
            const centerX = x + CELL_W / 2;
            const centerY = y + CELL_H / 2;

            return (
              <g
                key={`p-${file}-${rank}`}
                transform={`rotate(${rotateDeg} ${centerX} ${centerY})`}
                className="pointer-events-none"
                pointerEvents="none"
                style={{ pointerEvents: 'none' }}
              >
                <svg
                  x={offsetX}
                  y={offsetY}
                  width={pieceRenderW}
                  height={pieceRenderH}
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
              </g>
            );
          });
        })}

        {/* Layer 4: Opponent's Last Move Directional Arrow */}
        {showLastMoveArrow && lastMove?.from && lastMove?.to && (
          <g className="pointer-events-none">
            <line
              x1={getCellX(lastMove.from.file) + CELL_W / 2}
              y1={getCellY(lastMove.from.rank) + CELL_H / 2}
              x2={getCellX(lastMove.to.file) + CELL_W / 2}
              y2={getCellY(lastMove.to.rank) + CELL_H / 2}
              stroke="#0284c7"
              strokeWidth="3.5"
              strokeLinecap="round"
              markerEnd={`url(#${lastMoveArrowId})`}
              opacity="0.85"
            />
          </g>
        )}

        {/* Opponent's Last Move Piece Drop Ring Indicator */}
        {showLastMoveArrow && lastMove?.isDrop && lastMove?.to && (
          <g className="pointer-events-none">
            <circle
              cx={getCellX(lastMove.to.file) + CELL_W / 2}
              cy={getCellY(lastMove.to.rank) + CELL_H / 2}
              r={CELL_W * 0.42}
              fill="none"
              stroke="#0284c7"
              strokeWidth="2.5"
              strokeDasharray="4 2"
              opacity="0.9"
            />
          </g>
        )}

        {/* Answer Hint Directional Arrow */}
        {hintArrow && hintArrow.from && (
          <g className="pointer-events-none">
            <line
              x1={getCellX(hintArrow.from.file) + CELL_W / 2}
              y1={getCellY(hintArrow.from.rank) + CELL_H / 2}
              x2={getCellX(hintArrow.to.file) + CELL_W / 2}
              y2={getCellY(hintArrow.to.rank) + CELL_H / 2}
              stroke="#fbbf24"
              strokeWidth="4"
              strokeLinecap="round"
              markerEnd={`url(#${hintArrowId})`}
              opacity="0.95"
            />
          </g>
        )}

        {/* Layer 5: Topmost Interactive Click Hit-Test Grid */}
        {Array.from({ length: 9 }).map((_, rankIdx) => {
          const rank = rankIdx + 1;
          return Array.from({ length: 9 }).map((_, fileIdx) => {
            const file = 9 - fileIdx;
            const x = getCellX(file);
            const y = getCellY(rank);

            return (
              <rect
                key={`hit-${file}-${rank}`}
                data-square={`${file},${rank}`}
                x={x}
                y={y}
                width={CELL_W}
                height={CELL_H}
                fill="transparent"
                pointerEvents="all"
                style={{ pointerEvents: 'all' }}
                className="cursor-pointer hover:fill-amber-500/10 transition-colors"
                onClick={() => onSquareClick?.({ file, rank })}
              />
            );
          });
        })}

        {/* Layer 6: Coordinate Labels (Top File Numbers 9-1 & Right Rank Kanji 一-九) */}
        {showCoordinates && Array.from({ length: 9 }).map((_, i) => {
          const fileNum = isFlipped ? i + 1 : 9 - i;
          const x = GRID_START_X + i * CELL_W + CELL_W / 2;
          return (
            <text
              key={`label-file-${i}`}
              x={x}
              y={VIEW_MIN_Y + 16}
              fontSize="14"
              fontWeight="bold"
              fontFamily="sans-serif"
              textAnchor="middle"
              fill="#94a3b8"
              className="pointer-events-none select-none"
            >
              {fileNum}
            </text>
          );
        })}

        {showCoordinates && Array.from({ length: 9 }).map((_, i) => {
          const rankStr = isFlipped ? BOARD_RANK_LABELS_FLIPPED[i] : BOARD_RANK_LABELS[i];
          const y = GRID_START_Y + i * CELL_H + CELL_H / 2 + 5;
          return (
            <text
              key={`label-rank-${i}`}
              x={BOARD_WIDTH + 12}
              y={y}
              fontSize="14"
              fontWeight="bold"
              fontFamily="sans-serif"
              textAnchor="middle"
              fill="#94a3b8"
              className="pointer-events-none select-none"
            >
              {rankStr}
            </text>
          );
        })}
      </svg>
    </div>
  );
};
