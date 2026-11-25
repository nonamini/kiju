/**
 * 5x5 Mini Shogi Board Diagram Editor.
 * Lightweight board arrangement tool for Rulebook illustrations (e.g. piece movement diagrams,
 * fork with knight "ふんどしの桂", checkmate patterns "頭金").
 * Click a square to place the selected piece icon, or click clear.
 * Follows Rule 1: strictly English code, comments, identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface Tactics5x5BoardEditorProps {
  initialRows?: string[][];
  onChange: (rows: string[][]) => void;
  className?: string;
}

const PALETTE_PIECES = [
  { label: '玉', value: '玉' },
  { label: '飛', value: '飛' },
  { label: '角', value: '角' },
  { label: '金', value: '金' },
  { label: '銀', value: '銀' },
  { label: '桂', value: '桂' },
  { label: '香', value: '香' },
  { label: '歩', value: '歩' },
  { label: '龍', value: '龍' },
  { label: '馬', value: '馬' },
  { label: 'と', value: 'と' },
  { label: '消去', value: '' },
];

const DEFAULT_5X5_GRID: string[][] = [
  ['', '', '', '', ''],
  ['', '', '', '', ''],
  ['', '', '', '', ''],
  ['', '', '', '', ''],
  ['', '', '', '', ''],
];

export const Tactics5x5BoardEditor: React.FC<Tactics5x5BoardEditorProps> = ({
  initialRows,
  onChange,
  className = '',
}) => {
  const { t } = useTranslation();
  const [grid, setGrid] = useState<string[][]>(() => {
    if (initialRows && initialRows.length === 5 && initialRows[0]?.length === 5) {
      return initialRows.map((r) => [...r]);
    }
    return DEFAULT_5X5_GRID.map((r) => [...r]);
  });
  const [selectedPiece, setSelectedPiece] = useState<string>('桂');

  const handleCellClick = (rIdx: number, cIdx: number) => {
    const next = grid.map((r, ri) =>
      r.map((cell, ci) => {
        if (ri === rIdx && ci === cIdx) {
          return selectedPiece;
        }
        return cell;
      })
    );
    setGrid(next);
    onChange(next);
  };

  const handleClearAll = () => {
    const next = DEFAULT_5X5_GRID.map((r) => [...r]);
    setGrid(next);
    onChange(next);
  };

  return (
    <div className={`flex flex-col gap-3 p-3 bg-slate-900 border border-slate-800 rounded-xl ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-amber-300">
          5×5 盤面図エディタ（マスをクリックして駒を配置）
        </span>
        <button
          type="button"
          onClick={handleClearAll}
          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition-colors"
        >
          全消去
        </button>
      </div>

      {/* Piece Palette */}
      <div className="flex flex-wrap gap-1 items-center bg-slate-950 p-2 rounded-lg border border-slate-800">
        <span className="text-[11px] text-slate-400 mr-1">
          {t('tactics.place_piece_label', '配置する駒:')}
        </span>
        {PALETTE_PIECES.map((p) => {
          const isSelected = selectedPiece === p.value;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => setSelectedPiece(p.value)}
              className={`w-7 h-7 flex items-center justify-center text-xs font-bold rounded transition-colors ${
                isSelected
                  ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-300'
                  : p.value === ''
                  ? 'bg-rose-950/40 text-rose-300 border border-rose-800/50 hover:bg-rose-900/60'
                  : 'bg-amber-100/90 text-slate-900 hover:bg-amber-200'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* 5x5 Grid Display */}
      <div className="flex justify-center my-1">
        <div className="grid grid-cols-5 gap-1 bg-amber-950/70 p-2 rounded-xl border-2 border-amber-800 shadow-inner">
          {grid.map((row, rIdx) =>
            row.map((cell, cIdx) => (
              <button
                key={`${rIdx}-${cIdx}`}
                type="button"
                onClick={() => handleCellClick(rIdx, cIdx)}
                className={`w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center text-sm font-bold rounded transition-transform active:scale-95 border ${
                  cell
                    ? 'bg-amber-100 text-slate-950 border-amber-400 shadow-sm'
                    : 'bg-amber-900/30 border-amber-900/40 text-transparent hover:bg-amber-800/40'
                }`}
              >
                {cell || '・'}
              </button>
            ))
          )}
        </div>
      </div>
      <p className="text-[10px] text-slate-400 text-center">
        ※ 駒の動かし方や「ふんどしの桂」「頭金」などの手筋・基本ルールの挿絵として利用されます
      </p>
    </div>
  );
};
