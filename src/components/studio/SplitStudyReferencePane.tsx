/**
 * Split-Screen Study Reference Pane (#144).
 * Provides side-by-side external reference browsing (URL + bookmarks + iframe)
 * and local tactics/study notes viewing while editing opening trees on the board.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict without any (Rule 2).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSafeStorage } from '../../utils/matchHistoryStorage';
import { loadTacticsItems } from '../../utils/tacticsStorage';
import { TacticsBranch, TacticsNoteItem } from '../../types/tacticsNote';
import { ShogiBoard } from '../../utils/shogiBoard';
import { parseUsiMove } from '../../utils/shogiRules';
import { ShogiBoardView } from '../board/ShogiBoardView';
import { JKFPlayer } from 'json-kifu-format';
import { toEmbeddableReferenceUrl } from '../../utils/referenceEmbedUrl';
import {
  BookProfile,
  YaneuraBookEntry,
  lookupBookMoves,
  getInMemoryYaneuraBook,
  setInMemoryYaneuraBook,
  loadBookProfiles,
  loadBookByProfileId,
} from '../../utils/yaneuraBookDb';

const JKF_PIECE_TO_USI: Record<string, string> = {
  FU: 'P',
  KY: 'L',
  KE: 'N',
  GI: 'S',
  KI: 'G',
  KA: 'B',
  HI: 'R',
};

function jkfMoveToUsi(
  from?: { x: number; y: number },
  to?: { x: number; y: number },
  piece?: string,
  promote?: boolean
): string {
  if (!to) return '';
  const toRank = String.fromCharCode(96 + to.y);
  if (!from) {
    const p = piece ? JKF_PIECE_TO_USI[piece] ?? '' : '';
    return p ? `${p}*${to.x}${toRank}` : '';
  }
  const fromRank = String.fromCharCode(96 + from.y);
  return `${from.x}${fromRank}${to.x}${toRank}${promote ? '+' : ''}`;
}

export interface SplitReferenceBookmark {
  id: string;
  label: string;
  url: string;
}

export const SPLIT_REF_BOOKMARKS_STORAGE_KEY = 'joseki_tree_split_ref_bookmarks';
export const SPLIT_REF_SCRATCHPAD_STORAGE_KEY = 'joseki_tree_split_ref_scratchpad';

const DEFAULT_BOOKMARKS: SplitReferenceBookmark[] = [];

function loadBookmarks(): SplitReferenceBookmark[] {
  try {
    const raw = getSafeStorage().getItem(SPLIT_REF_BOOKMARKS_STORAGE_KEY);
    if (!raw) return DEFAULT_BOOKMARKS;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_BOOKMARKS;
    const valid = parsed.filter(
      (item): item is SplitReferenceBookmark =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as SplitReferenceBookmark).id === 'string' &&
        typeof (item as SplitReferenceBookmark).label === 'string' &&
        typeof (item as SplitReferenceBookmark).url === 'string'
    );
    return valid.length > 0 ? valid : DEFAULT_BOOKMARKS;
  } catch {
    return DEFAULT_BOOKMARKS;
  }
}

function saveBookmarks(items: SplitReferenceBookmark[]): void {
  try {
    getSafeStorage().setItem(SPLIT_REF_BOOKMARKS_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage errors
  }
}

export function normalizeReferenceUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export interface SplitStudyReferencePaneProps {
  onClose: () => void;
  currentSfen?: string;
  onPlayUsiMove?: (usi: string) => void;
}

type ReferenceTab = 'web' | 'notes' | 'memo' | 'book';

export const SplitStudyReferencePane: React.FC<SplitStudyReferencePaneProps> = ({
  onClose,
  currentSfen,
  onPlayUsiMove,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<ReferenceTab>('notes');
  const [bookmarks, setBookmarks] = useState<SplitReferenceBookmark[]>(() =>
    loadBookmarks()
  );
  const [urlInput, setUrlInput] = useState<string>(
    () => bookmarks[0]?.url ?? ''
  );
  const [activeUrl, setActiveUrl] = useState<string>(
    () => bookmarks[0]?.url ?? ''
  );
  const iframeSrc = useMemo(
    () => toEmbeddableReferenceUrl(activeUrl),
    [activeUrl]
  );
  const [isAddingBookmark, setIsAddingBookmark] = useState(false);
  const [newBmLabel, setNewBmLabel] = useState('');
  const [paneWidthMode, setPaneWidthMode] = useState<'normal' | 'wide'>('normal');

  // Local tactics notes viewer state
  const tacticsItems = useMemo<TacticsNoteItem[]>(() => loadTacticsItems(), []);
  const [selectedTacticId, setSelectedTacticId] = useState<string>(
    () => tacticsItems[0]?.id ?? ''
  );
  const selectedTactic = useMemo(
    () => tacticsItems.find((item) => item.id === selectedTacticId) ?? tacticsItems[0],
    [tacticsItems, selectedTacticId]
  );

  const effectiveBranches = useMemo<TacticsBranch[]>(() => {
    const explicit = selectedTactic?.branches ?? [];
    if (!selectedTactic?.jkfJson) return explicit;
    try {
      const parsed = JSON.parse(selectedTactic.jkfJson);
      const jkfPlayer = new JKFPlayer(parsed);
      const mainMoves: string[] = [];
      for (let p = 1; p <= jkfPlayer.getMaxTesuu(); p++) {
        const m = jkfPlayer.kifu.moves[p]?.move;
        if (m) {
          const u = jkfMoveToUsi(m.from, m.to, m.piece, m.promote);
          if (u) mainMoves.push(u);
        }
      }
      const extracted: TacticsBranch[] = [...explicit];
      const walkForks = (
        movesArr: typeof jkfPlayer.kifu.moves,
        prefixMoves: string[],
        prefixComments: Array<{ ply: number; comment: string }>,
        startPly: number,
        idPrefix: string
      ) => {
        for (let idx = 0; idx < movesArr.length; idx++) {
          const node = movesArr[idx];
          if (!node) continue;
          const ply = startPly + idx;
          const forks = node.forks;
          if (forks && forks.length > 0) {
            forks.forEach((forkMoves, fIdx) => {
              const branchMoves = [...prefixMoves];
              const branchComments = [...prefixComments];
              for (let fi = 0; fi < forkMoves.length; fi++) {
                const fm = forkMoves[fi];
                if (!fm) continue;
                if (fm.move) {
                  const u = jkfMoveToUsi(
                    fm.move.from,
                    fm.move.to,
                    fm.move.piece,
                    fm.move.promote
                  );
                  if (u) branchMoves.push(u);
                }
                if (fm.comments && fm.comments.length > 0) {
                  branchComments.push({
                    ply: ply + fi,
                    comment: fm.comments.join('\n'),
                  });
                }
              }
              const branchId = `${idPrefix}_${ply}_${fIdx}`;
              if (branchMoves.length >= ply) {
                extracted.push({
                  id: branchId,
                  name: `Branch ${ply}-${fIdx + 1}`,
                  moves: branchMoves,
                  moveComments: branchComments,
                });
              }
              walkForks(
                forkMoves,
                [...prefixMoves],
                [...prefixComments],
                ply,
                branchId
              );
            });
          }
          if (node.move) {
            const u = jkfMoveToUsi(
              node.move.from,
              node.move.to,
              node.move.piece,
              node.move.promote
            );
            if (u) prefixMoves.push(u);
          }
          if (node.comments && node.comments.length > 0) {
            prefixComments.push({
              ply,
              comment: node.comments.join('\n'),
            });
          }
        }
      };
      walkForks(jkfPlayer.kifu.moves, [], [], 0, 'jkf_fork');
      return extracted;
    } catch {
      return explicit;
    }
  }, [selectedTactic]);

  const [selectedBranchId, setSelectedBranchId] = useState<string>('main');
  const activeBranch = useMemo(
    () =>
      selectedBranchId === 'main'
        ? null
        : effectiveBranches.find((b) => b.id === selectedBranchId) ?? null,
    [effectiveBranches, selectedBranchId]
  );

  const activeMoves = activeBranch?.moves ?? selectedTactic?.moves;
  const activeSfen = activeBranch?.sfen ?? selectedTactic?.sfen;
  const activeMoveComments = activeBranch
    ? activeBranch.moveComments
    : selectedTactic?.moveComments;

  const [tacticPly, setTacticPly] = useState<number>(
    () => activeMoves?.length ?? 0
  );

  useEffect(() => {
    setSelectedBranchId('main');
    setTacticPly(selectedTactic?.moves?.length ?? 0);
  }, [selectedTactic?.id]);

  const tacticMiniBoard = useMemo<ShogiBoard | null>(() => {
    if (!selectedTactic) return null;
    if (!activeSfen && (!activeMoves || activeMoves.length === 0)) {
      return null;
    }
    try {
      const board = activeSfen
        ? ShogiBoard.fromSfen(activeSfen)
        : new ShogiBoard();
      if (activeMoves && activeMoves.length > 0) {
        const limit = Math.min(tacticPly, activeMoves.length);
        for (let i = 0; i < limit; i++) {
          const usi = activeMoves[i];
          if (!usi) continue;
          const parsed = parseUsiMove(
            usi,
            board,
            board.getPly() + 1,
            board.getTurn()
          );
          if (parsed) {
            board.applyMove(parsed);
          }
        }
      }
      return board;
    } catch {
      return null;
    }
  }, [selectedTactic, activeSfen, activeMoves, tacticPly]);

  const currentMoveComment = useMemo(() => {
    if (!activeMoveComments) return null;
    return activeMoveComments.find((c) => c.ply === tacticPly)?.comment ?? null;
  }, [activeMoveComments, tacticPly]);

  const branchesAtCurrentPly = useMemo(() => {
    const curMoves = activeMoves ?? [];
    const allLines: Array<{ id: string; isMain: boolean; moves: string[] }> = [
      { id: 'main', isMain: true, moves: selectedTactic?.moves ?? [] },
      ...effectiveBranches.map((b) => ({
        id: b.id,
        isMain: false,
        moves: b.moves,
      })),
    ];
    const seenNextMoves = new Set<string>();
    const result: Array<{ id: string; isMain: boolean; moves: string[] }> = [];
    for (const line of allLines) {
      if (line.id === selectedBranchId) continue;
      if (line.moves.length <= tacticPly) continue;
      let prefixMatches = true;
      for (let i = 0; i < tacticPly; i++) {
        if (line.moves[i] !== curMoves[i]) {
          prefixMatches = false;
          break;
        }
      }
      if (!prefixMatches) continue;
      const nextUsi = line.moves[tacticPly];
      if (!nextUsi || nextUsi === curMoves[tacticPly]) continue;
      if (seenNextMoves.has(nextUsi)) continue;
      seenNextMoves.add(nextUsi);
      result.push(line);
    }
    return result;
  }, [effectiveBranches, activeMoves, selectedBranchId, selectedTactic, tacticPly]);

  // Quick study scratchpad
  const [scratchpad, setScratchpad] = useState<string>(() => {
    try {
      return getSafeStorage().getItem(SPLIT_REF_SCRATCHPAD_STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  });

  // YaneuraOu .db opening book state (kept in module memory while app is running)
  const [bookFileName, setBookFileName] = useState<string | null>(
    () => getInMemoryYaneuraBook()?.fileName ?? null
  );
  const [bookMap, setBookMap] = useState<Map<string, YaneuraBookEntry[]> | null>(
    () => getInMemoryYaneuraBook()?.book ?? null
  );
  const [isLoadingBook, setIsLoadingBook] = useState(false);
  const [bookProfiles] = useState<BookProfile[]>(() => loadBookProfiles());
  const [selectedBookProfileId, setSelectedBookProfileId] = useState<string>(
    () => loadBookProfiles()[0]?.id ?? ''
  );

  const currentBookBoard = useMemo<ShogiBoard | null>(() => {
    if (!currentSfen) return null;
    try {
      return ShogiBoard.fromSfen(currentSfen);
    } catch {
      return null;
    }
  }, [currentSfen]);

  const currentBookMoves = useMemo<YaneuraBookEntry[]>(() => {
    if (!bookMap || !currentSfen) return [];
    return lookupBookMoves(bookMap, currentSfen);
  }, [bookMap, currentSfen]);

  const handleScratchpadChange = (value: string) => {
    setScratchpad(value);
    try {
      getSafeStorage().setItem(SPLIT_REF_SCRATCHPAD_STORAGE_KEY, value);
    } catch {
      // Ignore storage errors
    }
  };

  const handleNavigateUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeReferenceUrl(urlInput);
    if (!normalized) return;
    setUrlInput(normalized);
    setActiveUrl(normalized);
  };

  const handleSelectBookmark = (bm: SplitReferenceBookmark) => {
    setUrlInput(bm.url);
    setActiveUrl(bm.url);
    setActiveTab('web');
  };

  const handleAddBookmark = () => {
    const normalized = normalizeReferenceUrl(urlInput);
    if (!normalized) return;
    const label =
      newBmLabel.trim() ||
      (() => {
        try {
          return new URL(normalized).hostname.replace(/^www\./, '');
        } catch {
          return normalized;
        }
      })();
    const next: SplitReferenceBookmark[] = [
      ...bookmarks,
      { id: `bm-${Date.now().toString(36)}`, label, url: normalized },
    ];
    setBookmarks(next);
    saveBookmarks(next);
    setNewBmLabel('');
    setIsAddingBookmark(false);
  };

  const handleRemoveBookmark = (id: string) => {
    const next = bookmarks.filter((b) => b.id !== id);
    setBookmarks(next.length > 0 ? next : DEFAULT_BOOKMARKS);
    saveBookmarks(next.length > 0 ? next : DEFAULT_BOOKMARKS);
  };

  const handleOpenExternalWindow = () => {
    if (!activeUrl) return;
    window.open(activeUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <aside
      className={`fixed inset-0 z-30 lg:static lg:z-auto flex flex-col bg-slate-950 border-l border-slate-800 shrink-0 ${
        paneWidthMode === 'wide' ? 'lg:w-[560px]' : 'lg:w-[420px]'
      }`}
    >
      {/* Header Bar */}
      <div className="px-3 py-2 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm">🌐</span>
          <span className="text-xs font-bold text-amber-300 truncate">
            {t('studio.split_ref.title')}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() =>
              setPaneWidthMode((prev) => (prev === 'normal' ? 'wide' : 'normal'))
            }
            className="hidden lg:inline-flex px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold border border-slate-700 transition"
            title={t('studio.split_ref.toggle_width')}
          >
            {paneWidthMode === 'wide' ? '◧' : '◨'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700 transition"
            title={t('common.close')}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Mode Tabs */}
      <div className="flex border-b border-slate-800 bg-slate-900/50 px-2 pt-1.5 gap-1 shrink-0">
        {(
          [
            { id: 'web', labelKey: 'studio.split_ref.tab_web', icon: '🌐' },
            { id: 'notes', labelKey: 'studio.split_ref.tab_notes', icon: '📖' },
            { id: 'book', labelKey: 'studio.split_ref.tab_book', icon: '📚' },
            { id: 'memo', labelKey: 'studio.split_ref.tab_memo', icon: '📝' },
          ] as Array<{ id: ReferenceTab; labelKey: string; icon: string }>
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-t-lg transition flex items-center gap-1 ${
              activeTab === tab.id
                ? 'bg-slate-950 text-amber-300 border-t border-x border-slate-800'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{t(tab.labelKey)}</span>
          </button>
        ))}
      </div>

      {/* Tab Body */}
      {activeTab === 'web' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* URL Bar */}
          <form
            onSubmit={handleNavigateUrl}
            className="p-2 border-b border-slate-800 bg-slate-900/40 flex items-center gap-1.5 shrink-0"
          >
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder={t('studio.split_ref.url_placeholder')}
              className="flex-1 min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs font-mono text-slate-200 focus:border-amber-500/60 focus:outline-none"
            />
            <button
              type="submit"
              className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold transition shrink-0"
            >
              {t('studio.split_ref.go_btn')}
            </button>
            <button
              type="button"
              onClick={handleOpenExternalWindow}
              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs transition shrink-0"
              title={t('studio.split_ref.open_external')}
            >
              ↗
            </button>
          </form>

          {/* Bookmarks Bar */}
          <div className="px-2 py-1.5 border-b border-slate-800/80 bg-slate-900/20 flex items-center gap-1.5 flex-wrap shrink-0">
            {bookmarks.map((bm) => (
              <div
                key={bm.id}
                className={`inline-flex items-center rounded border text-[10px] ${
                  activeUrl === bm.url
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                    : 'bg-slate-900 border-slate-700 text-slate-300'
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleSelectBookmark(bm)}
                  className="px-2 py-0.5 font-medium hover:text-white"
                >
                  {bm.label}
                </button>
                {bookmarks.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveBookmark(bm.id)}
                    className="pr-1.5 text-slate-500 hover:text-rose-400"
                    title={t('common.delete')}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setIsAddingBookmark((v) => !v)}
              className="px-2 py-0.5 rounded border border-dashed border-slate-700 text-[10px] text-slate-400 hover:text-amber-300 hover:border-amber-500/50 transition"
            >
              + {t('studio.split_ref.add_bookmark')}
            </button>
          </div>

          {isAddingBookmark && (
            <div className="px-2 py-2 border-b border-slate-800 bg-slate-900/60 flex items-center gap-1.5 shrink-0">
              <input
                type="text"
                value={newBmLabel}
                onChange={(e) => setNewBmLabel(e.target.value)}
                placeholder={t('studio.split_ref.bookmark_label_placeholder')}
                className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddBookmark}
                className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
              >
                {t('common.save')}
              </button>
            </div>
          )}

          {/* Embedded Frame + Fallback Notice */}
          <div className="px-2.5 py-1 bg-slate-900/60 border-b border-slate-800/80 text-[10px] text-slate-400 flex items-center justify-between gap-2 shrink-0">
            <span className="truncate">{t('studio.split_ref.iframe_notice')}</span>
            <button
              type="button"
              onClick={handleOpenExternalWindow}
              className="text-amber-400 hover:text-amber-300 underline shrink-0"
            >
              {t('studio.split_ref.open_external')}
            </button>
          </div>

          <div className="flex-1 min-h-0 bg-white">
            {(() => {
              const iframeExtraProps: Record<string, string> =
                typeof window !== 'undefined' && window.crossOriginIsolated
                  ? { credentialless: '' }
                  : {};
              return (
                <iframe
                  key={iframeSrc}
                  src={iframeSrc}
                  title={t('studio.split_ref.title')}
                  className="w-full h-full border-0"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                  {...iframeExtraProps}
                />
              );
            })()}
          </div>
        </div>
      )}

      {activeTab === 'notes' && (
        <div className="flex-1 flex flex-col min-h-0 p-3 space-y-3 overflow-y-auto">
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
              {t('studio.split_ref.select_note')}
            </label>
            <select
              value={selectedTactic?.id ?? ''}
              onChange={(e) => setSelectedTacticId(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 focus:border-amber-500/60 focus:outline-none"
            >
              {tacticsItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title} ({item.tag})
                </option>
              ))}
            </select>
          </div>

          {selectedTactic ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-bold text-amber-300 text-sm">{selectedTactic.title}</h4>
                <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300 border border-slate-700">
                  {selectedTactic.tag}
                </span>
              </div>
              {tacticMiniBoard && (
                  <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800 flex flex-col items-center gap-2">
                    <ShogiBoardView
                      board={tacticMiniBoard}
                      isFlipped={false}
                      className="w-full max-w-[260px]"
                    />
                    {activeMoves && activeMoves.length > 0 && (
                      <div className="flex items-center justify-center gap-1.5 w-full">
                        <button
                          type="button"
                          onClick={() => setTacticPly(0)}
                          disabled={tacticPly <= 0}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-[11px] font-mono transition"
                        >
                          |&lt;
                        </button>
                        <button
                          type="button"
                          onClick={() => setTacticPly((p) => Math.max(0, p - 1))}
                          disabled={tacticPly <= 0}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-[11px] font-mono transition"
                        >
                          &lt;
                        </button>
                        <span className="px-2 text-[11px] font-mono text-slate-300">
                          {tacticPly} / {activeMoves.length}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setTacticPly((p) =>
                              Math.min(activeMoves.length, p + 1)
                            )
                          }
                          disabled={tacticPly >= activeMoves.length}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-[11px] font-mono transition"
                        >
                          &gt;
                        </button>
                        <button
                          type="button"
                          onClick={() => setTacticPly(activeMoves.length)}
                          disabled={tacticPly >= activeMoves.length}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-[11px] font-mono transition"
                        >
                          &gt;|
                        </button>
                      </div>
                    )}
                    {branchesAtCurrentPly.length > 0 && (
                      <div className="w-full flex flex-wrap items-center gap-1 pt-1 border-t border-slate-800/80">
                        {(() => {
                          const curNextUsi = activeMoves?.[tacticPly];
                          const curNextLabel =
                            curNextUsi && tacticMiniBoard
                              ? parseUsiMove(
                                  curNextUsi,
                                  tacticMiniBoard,
                                  tacticMiniBoard.getPly() + 1,
                                  tacticMiniBoard.getTurn()
                                )?.kifString ?? curNextUsi
                              : null;
                          if (curNextLabel && activeMoves) {
                            return (
                              <button
                                type="button"
                                onClick={() =>
                                  setTacticPly((p) =>
                                    Math.min(activeMoves.length, p + 1)
                                  )
                                }
                                className="px-2 py-0.5 rounded text-[10px] font-semibold border transition bg-emerald-950/50 text-emerald-200 border-emerald-700/60 hover:bg-emerald-900/60"
                              >
                                {selectedBranchId === 'main'
                                  ? `${t('studio.tree.main_trunk')}: ${curNextLabel}`
                                  : curNextLabel}
                              </button>
                            );
                          }
                          return null;
                        })()}
                        {branchesAtCurrentPly.map((line) => {
                          const nextUsi = line.moves[tacticPly];
                          const nextMoveLabel =
                            nextUsi && tacticMiniBoard
                              ? parseUsiMove(
                                  nextUsi,
                                  tacticMiniBoard,
                                  tacticMiniBoard.getPly() + 1,
                                  tacticMiniBoard.getTurn()
                                )?.kifString ?? nextUsi
                              : nextUsi ?? '';
                          return (
                            <button
                              key={line.id}
                              type="button"
                              onClick={() => {
                                setSelectedBranchId(line.id);
                                setTacticPly((p) => Math.min(line.moves.length, p + 1));
                              }}
                              className="px-2 py-0.5 rounded text-[10px] font-semibold border transition bg-amber-950/40 text-amber-200 border-amber-800/50 hover:bg-amber-900/50"
                            >
                              {line.isMain
                                ? `${t('studio.tree.main_trunk')}: ${nextMoveLabel}`
                                : nextMoveLabel}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {currentMoveComment && (
                      <div className="w-full p-2 rounded bg-sky-950/40 border border-sky-800/50 text-sky-200 text-[11px] leading-relaxed whitespace-pre-wrap">
                        {currentMoveComment}
                      </div>
                    )}
                  </div>
                )}
              {selectedTactic.summary && (
                <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {selectedTactic.summary}
                </p>
              )}
              {selectedTactic.pros && (
                <div className="p-2 rounded bg-emerald-950/30 border border-emerald-900/40 text-emerald-200 text-[11px]">
                  <span className="font-bold block mb-0.5">
                    {t('studio.split_ref.note_pros')}
                  </span>
                  {selectedTactic.pros}
                </div>
              )}
              {selectedTactic.cons && (
                <div className="p-2 rounded bg-rose-950/30 border border-rose-900/40 text-rose-200 text-[11px]">
                  <span className="font-bold block mb-0.5">
                    {t('studio.split_ref.note_cons')}
                  </span>
                  {selectedTactic.cons}
                </div>
              )}
              {selectedTactic.tip && (
                <div className="p-2 rounded bg-amber-950/30 border border-amber-900/40 text-amber-200 text-[11px]">
                  <span className="font-bold block mb-0.5">
                    {t('studio.split_ref.note_tip')}
                  </span>
                  {selectedTactic.tip}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500">{t('studio.split_ref.no_notes')}</p>
          )}
        </div>
      )}

      {activeTab === 'book' && (
        <div className="flex-1 flex flex-col min-h-0 p-3 space-y-3 overflow-y-auto">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {bookFileName && (
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <span className="truncate max-w-[200px]" title={bookFileName}>
                  {bookFileName} ({bookMap?.size ?? 0})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setBookFileName(null);
                    setBookMap(null);
                    setInMemoryYaneuraBook(null, null);
                  }}
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {isLoadingBook ? (
            <div className="flex items-center gap-2 py-4 text-xs text-amber-300">
              <span className="inline-block w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              <span>Loading .db...</span>
            </div>
          ) : !bookMap ? (
            <div className="space-y-2.5">
              {bookProfiles.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={selectedBookProfileId}
                    onChange={(e) => setSelectedBookProfileId(e.target.value)}
                    className="flex-1 min-w-[140px] rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 focus:border-amber-500/60 focus:outline-none"
                  >
                    {bookProfiles.map((bp) => (
                      <option key={bp.id} value={bp.id}>
                        {bp.name} ({bp.fileName})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!selectedBookProfileId) return;
                      setIsLoadingBook(true);
                      try {
                        const res = await loadBookByProfileId(selectedBookProfileId);
                        if (res) {
                          setBookFileName(res.fileName);
                          setBookMap(res.book);
                        }
                      } finally {
                        setIsLoadingBook(false);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 text-xs font-semibold transition"
                  >
                    🔄 {t('studio.split_ref.book_load_selected', '読込')}
                  </button>
                </div>
              )}
              <p className="text-xs text-slate-400 leading-relaxed">
                {t('studio.split_ref.book_empty_hint')}
              </p>
            </div>
          ) : currentBookMoves.length === 0 ? (
            <p className="text-xs text-slate-500">{t('studio.split_ref.book_no_match')}</p>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/90 text-[10px] text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="px-2.5 py-1.5">{t('studio.split_ref.book_col_move')}</th>
                    <th className="px-2.5 py-1.5 text-right">{t('studio.split_ref.book_col_score')}</th>
                    <th className="px-2.5 py-1.5 text-right">{t('studio.split_ref.book_col_depth')}</th>
                    <th className="px-2.5 py-1.5 text-right">{t('studio.split_ref.book_col_count')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {currentBookMoves.map((entry, idx) => {
                    const moveLabel = currentBookBoard
                      ? parseUsiMove(
                          entry.bestMove,
                          currentBookBoard,
                          currentBookBoard.getPly() + 1,
                          currentBookBoard.getTurn()
                        )?.kifString ?? entry.bestMove
                      : entry.bestMove;
                    return (
                      <tr
                        key={`${entry.bestMove}-${idx}`}
                        onClick={() => onPlayUsiMove?.(entry.bestMove)}
                        className="hover:bg-slate-800/60 cursor-pointer transition"
                      >
                        <td className="px-2.5 py-1.5 text-amber-300 font-bold">{moveLabel}</td>
                        <td className="px-2.5 py-1.5 text-right text-emerald-300">{entry.score}</td>
                        <td className="px-2.5 py-1.5 text-right text-slate-400">{entry.depth}</td>
                        <td className="px-2.5 py-1.5 text-right text-slate-300">{entry.count}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'memo' && (
        <div className="flex-1 flex flex-col min-h-0 p-3 space-y-2">
          <p className="text-[11px] text-slate-400">
            {t('studio.split_ref.memo_desc')}
          </p>
          <textarea
            value={scratchpad}
            onChange={(e) => handleScratchpadChange(e.target.value)}
            placeholder={t('studio.split_ref.memo_placeholder')}
            className="flex-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs text-slate-200 leading-relaxed focus:border-amber-500/60 focus:outline-none resize-none"
          />
        </div>
      )}
    </aside>
  );
};
