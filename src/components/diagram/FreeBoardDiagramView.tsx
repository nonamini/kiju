/**
 * Reusable Arbitrary-Size Free Board Diagram Renderer (Issue #176 Phase 3).
 * Renders custom 1..9 x 1..9 partial Shogi boards with wood tiles, highlights,
 * symbol markers, SVG directional arrows, and optional coordinate offsets.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import React, { useId } from 'react';
import type {
  DiagramHighlightColor,
  DiagramPieceKind,
  FreeBoardDiagram,
} from '../../types/freeBoardDiagram';
import { clampDiagramDimension } from '../../utils/freeBoardDiagramStorage';

export interface FreeBoardDiagramViewProps {
  diagram: FreeBoardDiagram;
  cellSizePx?: number;
  selectedCell?: { col: number; row: number } | null;
  onCellClick?: (col: number, row: number) => void;
  onCellRightClick?: (col: number, row: number) => void;
  className?: string;
}

const RANK_KANJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九'] as const;

export const DIAGRAM_PIECE_LABELS: Record<
  DiagramPieceKind,
  { label: string; promoted: boolean }
> = {
  K: { label: '玉', promoted: false },
  R: { label: '飛', promoted: false },
  B: { label: '角', promoted: false },
  G: { label: '金', promoted: false },
  S: { label: '銀', promoted: false },
  N: { label: '桂', promoted: false },
  L: { label: '香', promoted: false },
  P: { label: '歩', promoted: false },
  '+R': { label: '龍', promoted: true },
  '+B': { label: '馬', promoted: true },
  '+S': { label: '全', promoted: true },
  '+N': { label: '圭', promoted: true },
  '+L': { label: '杏', promoted: true },
  '+P': { label: 'と', promoted: true },
};

const HIGHLIGHT_CLASSES: Record<DiagramHighlightColor, string> = {
  amber: 'bg-amber-400/40 ring-2 ring-inset ring-amber-500/80',
  emerald: 'bg-emerald-400/35 ring-2 ring-inset ring-emerald-500/80',
  rose: 'bg-rose-400/35 ring-2 ring-inset ring-rose-500/80',
  sky: 'bg-sky-400/35 ring-2 ring-inset ring-sky-500/80',
};

const STROKE_HEX: Record<DiagramHighlightColor, string> = {
  amber: '#d97706',
  emerald: '#059669',
  rose: '#e11d48',
  sky: '#0284c7',
};

const MARKER_TEXT_CLASSES: Record<DiagramHighlightColor, string> = {
  amber: 'text-amber-700',
  emerald: 'text-emerald-700',
  rose: 'text-rose-700',
  sky: 'text-sky-700',
};

const COLORS: readonly DiagramHighlightColor[] = ['amber', 'emerald', 'rose', 'sky'];

export const FreeBoardDiagramView: React.FC<FreeBoardDiagramViewProps> = ({
  diagram,
  cellSizePx = 42,
  selectedCell = null,
  onCellClick,
  onCellRightClick,
  className = '',
}) => {
  const uid = useId().replace(/:/g, '');
  const cols = clampDiagramDimension(diagram.cols);
  const rows = clampDiagramDimension(diagram.rows);
  const startFile = clampDiagramDimension(diagram.startFile ?? cols);
  const startRank = clampDiagramDimension(diagram.startRank ?? 1);
  const showCoords = Boolean(diagram.showCoords);

  const pieceMap = new Map(diagram.pieces.map((p) => [`${p.col},${p.row}`, p]));
  const highlightMap = new Map(
    diagram.highlights.map((h) => [`${h.col},${h.row}`, h])
  );
  const markerMap = new Map(diagram.markers.map((m) => [`${m.col},${m.row}`, m]));

  const boardW = cols * cellSizePx;
  const boardH = rows * cellSizePx;
  const isInteractive = Boolean(onCellClick || onCellRightClick);
  const fontSizePx = Math.max(12, Math.round(cellSizePx * 0.48));
  const markerFontSizePx = Math.max(12, Math.round(cellSizePx * 0.56));

  return (
    <div className={`inline-flex flex-col items-start select-none ${className}`}>
      {showCoords && (
        <div
          className="grid text-[10px] font-mono text-amber-200/85 mb-0.5 pr-4"
          style={{
            width: `${boardW + 16}px`,
            gridTemplateColumns: `repeat(${cols}, ${cellSizePx}px)`,
          }}
        >
          {Array.from({ length: cols }, (_, c) => {
            const fileVal = startFile - c;
            const label = fileVal >= 1 && fileVal <= 9 ? String(fileVal) : '';
            return (
              <div key={c} className="text-center font-bold">
                {label}
              </div>
            );
          })}
        </div>
      )}

      <div className="inline-flex items-stretch">
        <div
          className="relative bg-gradient-to-br from-[#e7bf78] via-[#d7aa5f] to-[#c79348] border-2 border-[#6b481b] rounded-sm shadow-md overflow-hidden"
          style={{ width: `${boardW}px`, height: `${boardH}px` }}
        >
          <div
            className="grid w-full h-full"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: rows }, (_, r) =>
              Array.from({ length: cols }, (__, c) => {
                const key = `${c},${r}`;
                const piece = pieceMap.get(key);
                const highlight = highlightMap.get(key);
                const marker = markerMap.get(key);
                const isSelected =
                  selectedCell !== null &&
                  selectedCell.col === c &&
                  selectedCell.row === r;
                const pieceMeta = piece ? DIAGRAM_PIECE_LABELS[piece.kind] : null;

                return (
                  <button
                    key={key}
                    type="button"
                    disabled={!isInteractive}
                    onClick={() => onCellClick?.(c, r)}
                    onContextMenu={(e) => {
                      if (!onCellRightClick) return;
                      e.preventDefault();
                      onCellRightClick(c, r);
                    }}
                    className={`relative border border-[#6b481b]/45 flex items-center justify-center p-0 m-0 ${
                      isInteractive ? 'cursor-pointer hover:bg-amber-200/20' : 'cursor-default'
                    } ${highlight ? HIGHLIGHT_CLASSES[highlight.color] : ''} ${
                      isSelected ? 'ring-2 ring-inset ring-cyan-300 bg-cyan-400/25' : ''
                    }`}
                  >
                    {piece && pieceMeta && (
                      <div
                        className={`flex items-center justify-center w-[84%] h-[86%] bg-gradient-to-b from-[#f9e8c3] to-[#e6c384] border border-[#7c521c] shadow-xs transition-transform ${
                          piece.owner === 'w' ? 'rotate-180' : ''
                        }`}
                        style={{
                          clipPath:
                            'polygon(50% 4%, 93% 22%, 86% 96%, 14% 96%, 7% 22%)',
                        }}
                      >
                        <span
                          className={`font-serif font-black leading-none ${
                            pieceMeta.promoted ? 'text-red-700' : 'text-[#1f1409]'
                          }`}
                          style={{ fontSize: `${fontSizePx}px` }}
                        >
                          {pieceMeta.label}
                        </span>
                      </div>
                    )}

                    {marker && (
                      <span
                        className={`pointer-events-none font-black leading-none drop-shadow-[0_1px_1px_rgba(255,255,255,0.8)] ${
                          piece ? 'absolute inset-0 flex items-center justify-center opacity-85' : ''
                        } ${MARKER_TEXT_CLASSES[marker.color ?? 'rose']}`}
                        style={{ fontSize: `${markerFontSizePx}px` }}
                      >
                        {marker.symbol}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Directional Arrows SVG Overlay */}
          {diagram.arrows.length > 0 && (
            <svg
              className="absolute inset-0 pointer-events-none"
              width={boardW}
              height={boardH}
              viewBox={`0 0 ${boardW} ${boardH}`}
            >
              <defs>
                {COLORS.map((c) => (
                  <marker
                    key={c}
                    id={`diag-arrow-${uid}-${c}`}
                    markerWidth="6"
                    markerHeight="6"
                    refX="4.5"
                    refY="3"
                    orient="auto"
                  >
                    <path d="M0,0 L6,3 L0,6 Z" fill={STROKE_HEX[c]} />
                  </marker>
                ))}
              </defs>
              {diagram.arrows.map((arrow, idx) => {
                const x1 = (arrow.fromCol + 0.5) * cellSizePx;
                const y1 = (arrow.fromRow + 0.5) * cellSizePx;
                const x2 = (arrow.toCol + 0.5) * cellSizePx;
                const y2 = (arrow.toRow + 0.5) * cellSizePx;
                const dx = x2 - x1;
                const dy = y2 - y1;
                const dist = Math.hypot(dx, dy);
                if (dist < 1) return null;
                const trim = Math.min(cellSizePx * 0.22, dist * 0.25);
                const ux = dx / dist;
                const uy = dy / dist;
                return (
                  <line
                    key={`${arrow.fromCol}-${arrow.fromRow}-${arrow.toCol}-${arrow.toRow}-${idx}`}
                    x1={x1 + ux * (trim * 0.45)}
                    y1={y1 + uy * (trim * 0.45)}
                    x2={x2 - ux * trim}
                    y2={y2 - uy * trim}
                    stroke={STROKE_HEX[arrow.color]}
                    strokeWidth={Math.max(2.5, cellSizePx * 0.08)}
                    strokeOpacity={0.88}
                    strokeLinecap="round"
                    markerEnd={`url(#diag-arrow-${uid}-${arrow.color})`}
                  />
                );
              })}
            </svg>
          )}
        </div>

        {showCoords && (
          <div
            className="flex flex-col justify-around text-[10px] font-serif text-amber-200/85 pl-1 w-4"
            style={{ height: `${boardH}px` }}
          >
            {Array.from({ length: rows }, (_, r) => {
              const rankIdx = startRank - 1 + r;
              const label =
                rankIdx >= 0 && rankIdx < RANK_KANJI.length
                  ? RANK_KANJI[rankIdx]
                  : '';
              return (
                <div key={r} className="text-center font-bold leading-none">
                  {label}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
