/**
 * Studio-Grade High-Fidelity SVG Shogi Board View.
 * Supports authentic Kaya SVG base + bespoke vector palettes (wood, dark, slate) + custom SVG/image,
 * along with single-kanji wood sprites (default), carved 2-kanji vector pieces, and custom sprite sheets.
 * Driven directly by standard shogi.js board state.
 * Follows Rule 1: strictly English identifiers, comments, and types.
 */

import React, { useId } from 'react';
import { Shogi } from 'shogi.js';
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

export interface StudioBoardSquare {
  x: number; // 1-9 (File / 筋)
  y: number; // 1-9 (Rank / 段)
}

export interface StudioShogiBoardViewProps {
  shogi: Shogi;
  isFlipped?: boolean;
  selectedSquare?: StudioBoardSquare | null;
  targetSquares?: StudioBoardSquare[];
  lastMove?: { from?: StudioBoardSquare; to: StudioBoardSquare } | null;
  hintSquares?: StudioBoardSquare[];
  onSquareClick?: (square: StudioBoardSquare) => void;
  onSquareContextMenu?: (square: StudioBoardSquare, e: React.MouseEvent<SVGRectElement>) => void;
  className?: string;
}

export const StudioShogiBoardView: React.FC<StudioShogiBoardViewProps> = ({
  shogi,
  isFlipped = false,
  selectedSquare,
  targetSquares = [],
  lastMove,
  hintSquares = [],
  onSquareClick,
  onSquareContextMenu,
  className = '',
}) => {
  const rawUid = useId();
  const safeUid = rawUid.replace(/:/g, '_');
  const boardGradId = `board-grad-${safeUid}`;

  const {
    showCoordinates,
    vectorPalette,
    boardImageHref,
    pieceSpriteHref: spriteSheetHref,
  } = useBoardAppearance();

  const getCellX = (file: number): number => {
    const colIndex = isFlipped ? file - 1 : 9 - file;
    return GRID_START_X + colIndex * CELL_W;
  };

  const getCellY = (rank: number): number => {
    const rowIndex = isFlipped ? 9 - rank : rank - 1;
    return GRID_START_Y + rowIndex * CELL_H;
  };

  return (
    <div className={`relative inline-flex items-center justify-center select-none ${className}`}>
      <svg
        viewBox={`${VIEW_MIN_X} ${VIEW_MIN_Y} ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="max-h-full max-w-full h-full w-auto drop-shadow-2xl rounded-sm"
        style={{ aspectRatio: `${VIEW_WIDTH} / ${VIEW_HEIGHT}` }}
      >
        {vectorPalette && (
          <defs>
            <linearGradient id={boardGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={vectorPalette.gradStart} />
              <stop offset="100%" stopColor={vectorPalette.gradEnd} />
            </linearGradient>
          </defs>
        )}

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

        {/* Layer 2: Move Highlights (Last Move, Selection, Target, Hint) */}
        {lastMove?.from && (
          <rect
            x={getCellX(lastMove.from.x)}
            y={getCellY(lastMove.from.y)}
            width={CELL_W}
            height={CELL_H}
            fill="rgba(245, 158, 11, 0.35)"
            stroke="#d97706"
            strokeWidth="1.2"
          />
        )}

        {lastMove?.to && (
          <rect
            x={getCellX(lastMove.to.x)}
            y={getCellY(lastMove.to.y)}
            width={CELL_W}
            height={CELL_H}
            fill="rgba(56, 189, 248, 0.38)"
            stroke="#0284c7"
            strokeWidth="1.5"
          />
        )}

        {selectedSquare && (
          <rect
            x={getCellX(selectedSquare.x)}
            y={getCellY(selectedSquare.y)}
            width={CELL_W}
            height={CELL_H}
            fill="rgba(16, 185, 129, 0.45)"
            stroke="#059669"
            strokeWidth="2"
          />
        )}

        {targetSquares.map((sq, idx) => (
          <circle
            key={`target-${idx}`}
            cx={getCellX(sq.x) + CELL_W / 2}
            cy={getCellY(sq.y) + CELL_H / 2}
            r={CELL_W * 0.16}
            fill="rgba(16, 185, 129, 0.85)"
            stroke="#fff"
            strokeWidth="1.5"
            className="pointer-events-none"
          />
        ))}

        {hintSquares.map((sq, idx) => (
          <rect
            key={`hint-${idx}`}
            x={getCellX(sq.x)}
            y={getCellY(sq.y)}
            width={CELL_W}
            height={CELL_H}
            fill={idx === 0 && hintSquares.length > 1 ? 'rgba(245, 158, 11, 0.45)' : 'rgba(168, 85, 247, 0.45)'}
            stroke={idx === 0 && hintSquares.length > 1 ? '#f59e0b' : '#a855f7'}
            strokeWidth="2"
            strokeDasharray={idx === 0 && hintSquares.length > 1 ? '4 2' : undefined}
          />
        ))}

        {/* Layer 3: Pieces from shogi.js */}
        {Array.from({ length: 9 }).map((_, rankIdx) => {
          const rank = rankIdx + 1;
          return Array.from({ length: 9 }).map((_, fileIdx) => {
            const file = 9 - fileIdx;
            const piece = shogi.get(file, rank);
            if (!piece) return null;

            const isGote = piece.color === 1;
            const { col, row } = getPieceSpriteCoords(piece.kind, isGote);

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
              >
                <svg
                  x={offsetX}
                  y={offsetY}
                  width={pieceRenderW}
                  height={pieceRenderH}
                  viewBox={`${col * 35} ${row * 37} 35 37`}
                >
                  <image
                    href={spriteSheetHref}
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

        {/* Layer 4: Transparent Hit-Test Grid for Clicking Squares */}
        {Array.from({ length: 9 }).map((_, rankIdx) => {
          const rank = rankIdx + 1;
          return Array.from({ length: 9 }).map((_, fileIdx) => {
            const file = 9 - fileIdx;
            const x = getCellX(file);
            const y = getCellY(rank);

            return (
              <rect
                key={`hit-${file}-${rank}`}
                x={x}
                y={y}
                width={CELL_W}
                height={CELL_H}
                fill="transparent"
                className="cursor-pointer hover:fill-amber-500/10 transition-colors"
                onClick={() => onSquareClick?.({ x: file, y: rank })}
                onContextMenu={(e) => {
                  if (onSquareContextMenu) {
                    e.preventDefault();
                    onSquareContextMenu({ x: file, y: rank }, e);
                  }
                }}
              />
            );
          });
        })}

        {/* Layer 5: Coordinate Labels (Top File Numbers 9-1 & Right Rank Kanji 一-九) */}
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
