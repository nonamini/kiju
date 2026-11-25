/**
 * Interactive Modal Editor for Arbitrary-Size Free Board Diagrams (Issue #176 Phase 3).
 * Allows creating/editing 1..9 x 1..9 partial Shogi diagrams with piece placement,
 * cell highlights, symbol markers, directional arrows, coordinate offsets, and
 * Firestore / Auto-Backup persistence.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { auth } from '../../services/firebase';
import { uploadFreeBoardDiagramToFirestore } from '../../services/firestoreKifuSync';
import type {
  DiagramHighlightColor,
  DiagramMarkerSymbol,
  DiagramPieceKind,
  FreeBoardDiagram,
} from '../../types/freeBoardDiagram';
import {
  resizeDiagramData,
  saveFreeBoardDiagram,
} from '../../utils/freeBoardDiagramStorage';
import { DIAGRAM_PIECE_LABELS, FreeBoardDiagramView } from './FreeBoardDiagramView';

export interface FreeBoardDiagramEditorModalProps {
  isOpen: boolean;
  initialDiagram?: FreeBoardDiagram | null;
  onClose: () => void;
  onSaved: (saved: FreeBoardDiagram) => void;
  /** When false, skips saving to global freeBoardDiagramStorage/Firestore and only passes the object to onSaved. */
  persistToLibrary?: boolean;
}

type EditorTool = 'piece' | 'highlight' | 'marker' | 'arrow' | 'erase';

const SIZE_PRESETS: ReadonlyArray<{ cols: number; rows: number }> = [
  { cols: 3, rows: 3 },
  { cols: 5, rows: 5 },
  { cols: 3, rows: 9 },
  { cols: 5, rows: 9 },
  { cols: 9, rows: 5 },
  { cols: 9, rows: 9 },
];

const PIECE_KINDS: readonly DiagramPieceKind[] = [
  'K',
  'R',
  'B',
  'G',
  'S',
  'N',
  'L',
  'P',
  '+R',
  '+B',
  '+S',
  '+N',
  '+L',
  '+P',
];

const COLORS: readonly DiagramHighlightColor[] = ['amber', 'emerald', 'rose', 'sky'];
const MARKERS: readonly DiagramMarkerSymbol[] = ['○', '×', '△', '★', '◎'];
const RANK_KANJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九'] as const;

const COLOR_SWATCH: Record<DiagramHighlightColor, string> = {
  amber: 'bg-amber-400 border-amber-300 text-slate-950',
  emerald: 'bg-emerald-400 border-emerald-300 text-slate-950',
  rose: 'bg-rose-400 border-rose-300 text-slate-950',
  sky: 'bg-sky-400 border-sky-300 text-slate-950',
};

function createEmptyDiagram(): FreeBoardDiagram {
  const now = new Date().toISOString();
  return {
    id: `diag_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: '',
    description: '',
    cols: 5,
    rows: 5,
    showCoords: true,
    startFile: 5,
    startRank: 1,
    pieces: [],
    highlights: [],
    markers: [],
    arrows: [],
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}

export const FreeBoardDiagramEditorModal: React.FC<
  FreeBoardDiagramEditorModalProps
> = ({ isOpen, initialDiagram, onClose, onSaved, persistToLibrary = true }) => {
  const { t } = useTranslation();

  const [diagram, setDiagram] = useState<FreeBoardDiagram>(createEmptyDiagram);
  const [tagsInput, setTagsInput] = useState<string>('');
  const [activeTool, setActiveTool] = useState<EditorTool>('piece');
  const [pieceKind, setPieceKind] = useState<DiagramPieceKind>('G');
  const [pieceOwner, setPieceOwner] = useState<'b' | 'w'>('b');
  const [activeColor, setActiveColor] = useState<DiagramHighlightColor>('amber');
  const [activeMarker, setActiveMarker] = useState<DiagramMarkerSymbol>('○');
  const [arrowStart, setArrowStart] = useState<{ col: number; row: number } | null>(
    null
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (initialDiagram) {
      const cloned: FreeBoardDiagram = {
        ...initialDiagram,
        pieces: [...initialDiagram.pieces],
        highlights: [...initialDiagram.highlights],
        markers: [...initialDiagram.markers],
        arrows: [...initialDiagram.arrows],
        tags: [...initialDiagram.tags],
      };
      setDiagram(cloned);
      setTagsInput(cloned.tags.join(', '));
    } else {
      setDiagram(createEmptyDiagram());
      setTagsInput('');
    }
    setArrowStart(null);
    setErrorMsg(null);
  }, [isOpen, initialDiagram]);

  if (!isOpen) return null;

  const handleResize = (nextCols: number, nextRows: number) => {
    setArrowStart(null);
    setDiagram((prev) => {
      const resized = resizeDiagramData(prev, nextCols, nextRows);
      const safeStartFile = Math.max(
        resized.cols,
        Math.min(9, resized.startFile ?? resized.cols)
      );
      const maxRank = Math.max(1, 10 - resized.rows);
      const safeStartRank = Math.max(
        1,
        Math.min(maxRank, resized.startRank ?? 1)
      );
      return {
        ...resized,
        startFile: safeStartFile,
        startRank: safeStartRank,
      };
    });
  };

  const handleCellClick = (col: number, row: number) => {
    if (activeTool === 'piece') {
      setDiagram((prev) => {
        const idx = prev.pieces.findIndex((p) => p.col === col && p.row === row);
        const existing = idx >= 0 ? prev.pieces[idx] : undefined;
        const nextPieces = [...prev.pieces];
        if (existing && existing.kind === pieceKind && existing.owner === pieceOwner) {
          nextPieces.splice(idx, 1);
        } else if (idx >= 0) {
          nextPieces[idx] = { col, row, kind: pieceKind, owner: pieceOwner };
        } else {
          nextPieces.push({ col, row, kind: pieceKind, owner: pieceOwner });
        }
        return { ...prev, pieces: nextPieces };
      });
      return;
    }

    if (activeTool === 'highlight') {
      setDiagram((prev) => {
        const idx = prev.highlights.findIndex(
          (h) => h.col === col && h.row === row
        );
        const existing = idx >= 0 ? prev.highlights[idx] : undefined;
        const nextHighlights = [...prev.highlights];
        if (existing && existing.color === activeColor) {
          nextHighlights.splice(idx, 1);
        } else if (idx >= 0) {
          nextHighlights[idx] = { col, row, color: activeColor };
        } else {
          nextHighlights.push({ col, row, color: activeColor });
        }
        return { ...prev, highlights: nextHighlights };
      });
      return;
    }

    if (activeTool === 'marker') {
      setDiagram((prev) => {
        const idx = prev.markers.findIndex((m) => m.col === col && m.row === row);
        const existing = idx >= 0 ? prev.markers[idx] : undefined;
        const nextMarkers = [...prev.markers];
        if (
          existing &&
          existing.symbol === activeMarker &&
          (existing.color ?? 'rose') === activeColor
        ) {
          nextMarkers.splice(idx, 1);
        } else if (idx >= 0) {
          nextMarkers[idx] = { col, row, symbol: activeMarker, color: activeColor };
        } else {
          nextMarkers.push({ col, row, symbol: activeMarker, color: activeColor });
        }
        return { ...prev, markers: nextMarkers };
      });
      return;
    }

    if (activeTool === 'arrow') {
      if (!arrowStart) {
        setArrowStart({ col, row });
        return;
      }
      if (arrowStart.col === col && arrowStart.row === row) {
        setArrowStart(null);
        return;
      }
      const start = arrowStart;
      setArrowStart(null);
      setDiagram((prev) => {
        const dupIdx = prev.arrows.findIndex(
          (a) =>
            a.fromCol === start.col &&
            a.fromRow === start.row &&
            a.toCol === col &&
            a.toRow === row
        );
        const nextArrows = [...prev.arrows];
        if (dupIdx >= 0) {
          nextArrows.splice(dupIdx, 1);
        } else {
          nextArrows.push({
            fromCol: start.col,
            fromRow: start.row,
            toCol: col,
            toRow: row,
            color: activeColor,
          });
        }
        return { ...prev, arrows: nextArrows };
      });
      return;
    }

    // Erase everything at (col, row)
    setDiagram((prev) => ({
      ...prev,
      pieces: prev.pieces.filter((p) => !(p.col === col && p.row === row)),
      highlights: prev.highlights.filter((h) => !(h.col === col && h.row === row)),
      markers: prev.markers.filter((m) => !(m.col === col && m.row === row)),
      arrows: prev.arrows.filter(
        (a) =>
          !(a.fromCol === col && a.fromRow === row) &&
          !(a.toCol === col && a.toRow === row)
      ),
    }));
  };

  const handleCellRightClick = (col: number, row: number) => {
    setDiagram((prev) => {
      const idx = prev.pieces.findIndex((p) => p.col === col && p.row === row);
      if (idx < 0) return prev;
      const nextPieces = [...prev.pieces];
      const cur = nextPieces[idx]!;
      nextPieces[idx] = {
        ...cur,
        owner: cur.owner === 'b' ? 'w' : 'b',
      };
      return { ...prev, pieces: nextPieces };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = diagram.title.trim();
    if (!trimmedTitle) {
      setErrorMsg(t('diagram_editor.title_required'));
      return;
    }

    const parsedTags = tagsInput
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const nowIso = new Date().toISOString();
    const candidate: FreeBoardDiagram = {
      ...diagram,
      title: trimmedTitle,
      description: diagram.description?.trim() || undefined,
      tags: parsedTags,
      createdAt: diagram.createdAt || nowIso,
      updatedAt: nowIso,
    };

    if (persistToLibrary) {
      const saved = saveFreeBoardDiagram(candidate);
      const uid = auth?.currentUser?.uid;
      if (uid) {
        void uploadFreeBoardDiagramToFirestore(uid, saved);
      }
      onSaved(saved);
    } else {
      onSaved(candidate);
    }
    onClose();
  };

  const previewCellSize = diagram.cols > 6 || diagram.rows > 6 ? 34 : 44;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-4xl rounded-2xl border border-slate-700 bg-slate-900 p-4 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <span>📐</span>
            <span>{t('diagram_editor.modal_title')}</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white text-sm"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: Metadata + Board Controls */}
          <div className="lg:col-span-6 space-y-3 text-xs">
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-300">
                {t('diagram_editor.title_label')}
              </label>
              <input
                type="text"
                value={diagram.title}
                onChange={(e) =>
                  setDiagram((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder={t('diagram_editor.title_placeholder')}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-300">
                {t('diagram_editor.description_label')}
              </label>
              <textarea
                rows={2}
                value={diagram.description ?? ''}
                onChange={(e) =>
                  setDiagram((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder={t('diagram_editor.description_placeholder')}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-300">
                {t('diagram_editor.tags_label')}
              </label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder={t('diagram_editor.tags_placeholder')}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            {/* Size & Coordinate Offset */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-slate-300">
                  {t('diagram_editor.size_label')}
                </span>
                <div className="flex flex-wrap gap-1">
                  {SIZE_PRESETS.map((p) => {
                    const active = diagram.cols === p.cols && diagram.rows === p.rows;
                    return (
                      <button
                        key={`${p.cols}x${p.rows}`}
                        type="button"
                        onClick={() => handleResize(p.cols, p.rows)}
                        className={`px-2 py-0.5 rounded border text-[10px] font-mono font-bold transition ${
                          active
                            ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                            : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {p.cols}×{p.rows}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">
                    {t('diagram_editor.cols_label')}
                  </label>
                  <select
                    value={diagram.cols}
                    onChange={(e) =>
                      handleResize(Number(e.target.value), diagram.rows)
                    }
                    className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-xs text-slate-100"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">
                    {t('diagram_editor.rows_label')}
                  </label>
                  <select
                    value={diagram.rows}
                    onChange={(e) =>
                      handleResize(diagram.cols, Number(e.target.value))
                    }
                    className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-xs text-slate-100"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">
                    {t('diagram_editor.start_file_label')}
                  </label>
                  <select
                    value={diagram.startFile ?? diagram.cols}
                    disabled={!diagram.showCoords}
                    onChange={(e) =>
                      setDiagram((prev) => ({
                        ...prev,
                        startFile: Number(e.target.value),
                      }))
                    }
                    className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-xs text-slate-100 disabled:opacity-40"
                  >
                    {Array.from(
                      { length: 10 - diagram.cols },
                      (_, i) => diagram.cols + i
                    ).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">
                    {t('diagram_editor.start_rank_label')}
                  </label>
                  <select
                    value={diagram.startRank ?? 1}
                    disabled={!diagram.showCoords}
                    onChange={(e) =>
                      setDiagram((prev) => ({
                        ...prev,
                        startRank: Number(e.target.value),
                      }))
                    }
                    className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-xs text-slate-100 disabled:opacity-40"
                  >
                    {Array.from({ length: 10 - diagram.rows }, (_, i) => i + 1).map(
                      (n) => (
                        <option key={n} value={n}>
                          {RANK_KANJI[n - 1]}
                        </option>
                      )
                    )}
                  </select>
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(diagram.showCoords)}
                  onChange={(e) =>
                    setDiagram((prev) => ({
                      ...prev,
                      showCoords: e.target.checked,
                    }))
                  }
                  className="rounded border-slate-600 bg-slate-900 text-amber-500"
                />
                <span>{t('diagram_editor.show_coords_label')}</span>
              </label>
            </div>

            {/* Editing Tools */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2.5">
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    { id: 'piece', labelKey: 'diagram_editor.tool_piece', icon: '☗' },
                    {
                      id: 'highlight',
                      labelKey: 'diagram_editor.tool_highlight',
                      icon: '🟨',
                    },
                    { id: 'marker', labelKey: 'diagram_editor.tool_marker', icon: '⭕' },
                    { id: 'arrow', labelKey: 'diagram_editor.tool_arrow', icon: '↗' },
                    { id: 'erase', labelKey: 'diagram_editor.tool_erase', icon: '🧹' },
                  ] as const
                ).map((tool) => (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => {
                      setActiveTool(tool.id);
                      setArrowStart(null);
                    }}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold transition ${
                      activeTool === tool.id
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
                    }`}
                  >
                    {tool.icon} {t(tool.labelKey)}
                  </button>
                ))}
              </div>

              {activeTool === 'piece' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPieceOwner('b')}
                      className={`px-2.5 py-1 rounded border text-[11px] font-bold ${
                        pieceOwner === 'b'
                          ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                          : 'bg-slate-900 border-slate-700 text-slate-400'
                      }`}
                    >
                      ☗ {t('board.sente')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPieceOwner('w')}
                      className={`px-2.5 py-1 rounded border text-[11px] font-bold ${
                        pieceOwner === 'w'
                          ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                          : 'bg-slate-900 border-slate-700 text-slate-400'
                      }`}
                    >
                      ☖ {t('board.gote')}
                    </button>
                    <span className="text-[10px] text-slate-400 ml-auto">
                      {t('diagram_editor.piece_hint')}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {PIECE_KINDS.map((kind) => {
                      const info = DIAGRAM_PIECE_LABELS[kind];
                      return (
                        <button
                          key={kind}
                          type="button"
                          onClick={() => setPieceKind(kind)}
                          className={`w-8 h-8 rounded border font-serif font-bold text-sm transition ${
                            pieceKind === kind
                              ? 'bg-amber-500 border-amber-300 text-slate-950 shadow'
                              : 'bg-slate-900 border-slate-700 text-slate-200 hover:border-slate-500'
                          } ${
                            info.promoted && pieceKind !== kind ? 'text-rose-400' : ''
                          }`}
                        >
                          {info.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {(activeTool === 'highlight' ||
                activeTool === 'marker' ||
                activeTool === 'arrow') && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-slate-400">
                    {t('diagram_editor.color_label')}
                  </span>
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setActiveColor(c)}
                      className={`w-6 h-6 rounded-full border-2 transition ${COLOR_SWATCH[c]} ${
                        activeColor === c ? 'ring-2 ring-white scale-110' : 'opacity-65'
                      }`}
                      title={c}
                    />
                  ))}
                  {activeTool === 'arrow' && (
                    <span className="text-[10px] text-cyan-300 ml-auto">
                      {arrowStart
                        ? t('diagram_editor.arrow_pick_end')
                        : t('diagram_editor.arrow_pick_start')}
                    </span>
                  )}
                </div>
              )}

              {activeTool === 'marker' && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {MARKERS.map((sym) => (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => setActiveMarker(sym)}
                      className={`w-8 h-8 rounded border font-bold text-sm transition ${
                        activeMarker === sym
                          ? 'bg-amber-500 border-amber-300 text-slate-950'
                          : 'bg-slate-900 border-slate-700 text-slate-200'
                      }`}
                    >
                      {sym}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Live Interactive Canvas */}
          <div className="lg:col-span-6 flex flex-col items-center justify-center rounded-xl border border-slate-800 bg-slate-950/75 p-4 gap-3 min-h-[300px]">
            <FreeBoardDiagramView
              diagram={diagram}
              cellSizePx={previewCellSize}
              selectedCell={arrowStart}
              onCellClick={handleCellClick}
              onCellRightClick={handleCellRightClick}
            />
            <div className="flex flex-wrap items-center justify-between w-full gap-2 text-[11px] text-slate-400 pt-2 border-t border-slate-800/80">
              <span>
                {diagram.cols}×{diagram.rows} ・{' '}
                {t('diagram_editor.stats_fmt', {
                  pieces: diagram.pieces.length,
                  marks:
                    diagram.highlights.length +
                    diagram.markers.length +
                    diagram.arrows.length,
                })}
              </span>
              <button
                type="button"
                onClick={() => {
                  setArrowStart(null);
                  setDiagram((prev) => ({
                    ...prev,
                    pieces: [],
                    highlights: [],
                    markers: [],
                    arrows: [],
                  }));
                }}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              >
                🗑️ {t('diagram_editor.clear_all_btn')}
              </button>
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="rounded-lg bg-rose-950/60 border border-rose-500/50 px-3 py-2 text-xs text-rose-200">
            {errorMsg}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
          >
            {t('position_editor.cancel')}
          </button>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow transition"
          >
            {t('position_editor.save_submit_btn')}
          </button>
        </div>
      </form>
    </div>
  );
};
