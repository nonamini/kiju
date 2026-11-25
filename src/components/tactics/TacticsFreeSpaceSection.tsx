/**
 * Unified Inline-Insertable Block Editor & Viewer for Tactics Notes (Issue #176 Phase 4).
 * Replaces the separate Free Space box with a Notion-style stream directly under Overview,
 * treating built-in tactic boards (`legacy_tactic`), embedded library kifu players (`kifu`),
 * partial board diagrams (`diagram`), and text notes (`text`) uniformly with insertion slots
 * above and below every block.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { auth } from '../../services/firebase';
import { ensureKifuRecordPayload } from '../../services/firestoreKifuSync';
import type { FreeBoardDiagram } from '../../types/freeBoardDiagram';
import type { KifuGameKind, KifuRecord } from '../../types/kifuRecord';
import type { TacticsNoteBlock, TacticsNoteItem } from '../../types/tacticsNote';
import { resolveGameKind } from '../../utils/gameKindClassifier';
import { loadFreeBoardDiagrams } from '../../utils/freeBoardDiagramStorage';
import {
  initKifuRecordStorage,
  loadKifuRecords,
} from '../../utils/kifuRecordStorage';
import {
  MAX_EMBEDDED_KIFU_PLAYERS,
  countEmbeddedKifuPlayers,
  createBlockId,
  insertNoteBlockAt,
  kifuRecordToTacticsPlayerItem,
  moveNoteBlock,
  removeNoteBlock,
  updateNoteBlock,
} from '../../utils/tacticsNoteBlocks';
import { FreeBoardDiagramEditorModal } from '../diagram/FreeBoardDiagramEditorModal';
import { FreeBoardDiagramView } from '../diagram/FreeBoardDiagramView';
import { TacticsDetailPlayer } from './TacticsDetailPlayer';

export interface TacticsFreeSpaceSectionProps {
  item: TacticsNoteItem;
  blocks: TacticsNoteBlock[];
  /** When false (view/locked mode), add/edit/delete/reorder controls are hidden. */
  isEditMode?: boolean;
  onChangeBlocks: (nextBlocks: TacticsNoteBlock[]) => void;
  onUpdateLegacyComment: (ply: number, comment: string) => void;
  onOpenLegacyInStudio: (item: TacticsNoteItem) => void;
}

function getKindSortPriority(kind: KifuGameKind): number {
  if (kind === 'joseki') return 0;
  if (kind === 'other') return 1;
  return 2;
}

export const TacticsFreeSpaceSection: React.FC<TacticsFreeSpaceSectionProps> = ({
  item,
  blocks,
  isEditMode = true,
  onChangeBlocks,
  onUpdateLegacyComment,
  onOpenLegacyInStudio,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [records, setRecords] = useState<KifuRecord[]>(() => loadKifuRecords());
  const [isStorageReady, setIsStorageReady] = useState<boolean>(false);
  const [hydratedPayloads, setHydratedPayloads] = useState<
    Map<string, KifuRecord>
  >(() => new Map());
  const [diagrams, setDiagrams] = useState<FreeBoardDiagram[]>(() =>
    loadFreeBoardDiagrams()
  );
  const hydratedAttemptedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void initKifuRecordStorage()
      .then(() => {
        if (!cancelled) {
          setRecords(loadKifuRecords());
          setIsStorageReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsStorageReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [activeInsertIndex, setActiveInsertIndex] = useState<number | null>(null);
  const [pendingInsertIndex, setPendingInsertIndex] = useState<number>(0);
  const [pickerMode, setPickerMode] = useState<'kifu' | 'diagram' | null>(null);
  const [pickerQuery, setPickerQuery] = useState<string>('');

  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState<string>('');
  const [draftText, setDraftText] = useState<string>('');
  const [draftPros, setDraftPros] = useState<string>('');
  const [draftCons, setDraftCons] = useState<string>('');

  useEffect(() => {
    if (!isEditMode) {
      setActiveInsertIndex(null);
      setEditingBlockId(null);
      setPickerMode(null);
    }
  }, [isEditMode]);

  const [diagramModalOpen, setDiagramModalOpen] = useState<boolean>(false);
  const [editingDiagram, setEditingDiagram] = useState<FreeBoardDiagram | null>(
    null
  );
  const [insertDiagramOnSave, setInsertDiagramOnSave] = useState<boolean>(false);

  const sortedRecords = useMemo(() => {
    return [...records].sort((a, b) => {
      const pa = getKindSortPriority(resolveGameKind(a));
      const pb = getKindSortPriority(resolveGameKind(b));
      if (pa !== pb) return pa - pb;
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });
  }, [records]);

  const recordMap = useMemo(
    () => new Map(records.map((r) => [r.id, r])),
    [records]
  );

  useEffect(() => {
    if (!isStorageReady) return;
    let cancelled = false;
    const uid = auth?.currentUser?.uid;
    const targets = blocks.filter((b) => {
      if (b.type !== 'kifu' || (b.displayMode ?? 'player') !== 'player') return false;
      if (hydratedAttemptedRef.current.has(b.kifuId)) return false;
      const rec = hydratedPayloads.get(b.kifuId) ?? recordMap.get(b.kifuId);
      return !rec || !rec.jkfJson || rec.jkfJson === '{}';
    });
    if (targets.length === 0) return;

    for (const tBlock of targets) {
      if (tBlock.type === 'kifu') {
        hydratedAttemptedRef.current.add(tBlock.kifuId);
      }
    }

    void Promise.all(
      targets.map((tBlock) =>
        tBlock.type === 'kifu'
          ? ensureKifuRecordPayload(uid, tBlock.kifuId)
          : Promise.resolve(null)
      )
    ).then((hydrated) => {
      if (cancelled) return;
      const valid = hydrated.filter(
        (r): r is KifuRecord => Boolean(r && r.jkfJson && r.jkfJson !== '{}')
      );
      if (valid.length > 0) {
        setHydratedPayloads((prev) => {
          const next = new Map(prev);
          for (const rec of valid) {
            next.set(rec.id, rec);
          }
          return next;
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isStorageReady, blocks, recordMap, hydratedPayloads]);

  const playerItemMap = useMemo<Map<string, TacticsNoteItem>>(() => {
    const map = new Map<string, TacticsNoteItem>();
    for (const r of records) {
      const effective = hydratedPayloads.get(r.id) ?? r;
      map.set(r.id, kifuRecordToTacticsPlayerItem(effective));
    }
    for (const [id, hydratedRec] of hydratedPayloads) {
      if (!map.has(id)) {
        map.set(id, kifuRecordToTacticsPlayerItem(hydratedRec));
      }
    }
    return map;
  }, [records, hydratedPayloads]);

  const embeddedPlayerCount = useMemo(
    () => countEmbeddedKifuPlayers(blocks),
    [blocks]
  );

  const diagramMap = useMemo(
    () => new Map(diagrams.map((d) => [d.id, d])),
    [diagrams]
  );

  const filteredPickerRecords = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return sortedRecords;
    return sortedRecords.filter((r) => {
      const hay =
        `${r.title} ${r.senteName} ${r.goteName} ${r.tags.join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sortedRecords, pickerQuery]);

  const filteredPickerDiagrams = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return diagrams;
    return diagrams.filter((d) => {
      const hay =
        `${d.title} ${d.description ?? ''} ${d.tags.join(' ')} ${d.cols}x${d.rows}`.toLowerCase();
      return hay.includes(q);
    });
  }, [diagrams, pickerQuery]);

  const handleAddTextBlockAt = (insertIndex: number) => {
    const newId = createBlockId('txt');
    const newBlock: TacticsNoteBlock = {
      id: newId,
      type: 'text',
      title: '',
      content: '',
    };
    onChangeBlocks(insertNoteBlockAt(blocks, newBlock, insertIndex));
    setActiveInsertIndex(null);
    setEditingBlockId(newId);
    setDraftTitle('');
    setDraftText('');
  };

  const handleAddProsConsBlockAt = (insertIndex: number) => {
    const newId = createBlockId('pc');
    const newBlock: TacticsNoteBlock = {
      id: newId,
      type: 'pros_cons',
      title: '',
      pros: '',
      cons: '',
    };
    onChangeBlocks(insertNoteBlockAt(blocks, newBlock, insertIndex));
    setActiveInsertIndex(null);
    setEditingBlockId(newId);
    setDraftTitle('');
    setDraftPros('');
    setDraftCons('');
  };

  const handleOpenPickerAt = (mode: 'kifu' | 'diagram', insertIndex: number) => {
    if (mode === 'diagram') {
      setDiagrams(loadFreeBoardDiagrams());
    }
    setPendingInsertIndex(insertIndex);
    setActiveInsertIndex(null);
    setPickerQuery('');
    setPickerMode(mode);
  };

  const handleInsertKifuBlock = (kifuId: string) => {
    const displayMode: 'player' | 'link' =
      embeddedPlayerCount < MAX_EMBEDDED_KIFU_PLAYERS ? 'player' : 'link';
    const newBlock: TacticsNoteBlock = {
      id: createBlockId('kifu'),
      type: 'kifu',
      kifuId,
      caption: '',
      displayMode,
    };
    onChangeBlocks(insertNoteBlockAt(blocks, newBlock, pendingInsertIndex));
    setPickerMode(null);
    setPickerQuery('');
  };

  const handleInsertDiagramBlock = (diagramId: string) => {
    const newBlock: TacticsNoteBlock = {
      id: createBlockId('diag'),
      type: 'diagram',
      diagramId,
      caption: '',
    };
    onChangeBlocks(insertNoteBlockAt(blocks, newBlock, pendingInsertIndex));
    setPickerMode(null);
    setPickerQuery('');
  };

  const startEditingBlock = (block: TacticsNoteBlock) => {
    setEditingBlockId(block.id);
    if (block.type === 'text') {
      setDraftTitle(block.title ?? '');
      setDraftText(block.content);
    } else if (block.type === 'pros_cons') {
      setDraftTitle(block.title ?? '');
      setDraftPros(block.pros ?? '');
      setDraftCons(block.cons ?? '');
    } else {
      setDraftTitle('');
      setDraftText(block.caption ?? '');
    }
  };

  const saveEditingBlock = (block: TacticsNoteBlock) => {
    onChangeBlocks(
      updateNoteBlock(blocks, block.id, (prev) => {
        if (prev.type === 'text') {
          return {
            ...prev,
            title: draftTitle.trim() || undefined,
            content: draftText,
          };
        }
        if (prev.type === 'pros_cons') {
          return {
            ...prev,
            title: draftTitle.trim() || undefined,
            pros: draftPros.trim() || undefined,
            cons: draftCons.trim() || undefined,
          };
        }
        return {
          ...prev,
          caption: draftText.trim() || undefined,
        };
      })
    );
    setEditingBlockId(null);
  };

  const renderKindBadge = (kind: KifuGameKind) => {
    if (kind === 'joseki') {
      return (
        <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-200 border border-indigo-500/40 text-[10px] font-bold">
          {t('library_page.joseki_winner_badge')}
        </span>
      );
    }
    if (kind === 'other') {
      return (
        <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-200 border border-sky-500/40 text-[10px] font-bold">
          {t('library_page.study_winner_badge')}
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-bold">
        {t(`library_page.game_kind_${kind}`)}
      </span>
    );
  };

  const renderActionButtons = (insertIndex: number) => (
    <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs">
      <button
        type="button"
        onClick={() => handleAddTextBlockAt(insertIndex)}
        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-semibold transition"
      >
        ＋ {t('tactics_free_space.add_text_btn')}
      </button>
      <button
        type="button"
        onClick={() => handleAddProsConsBlockAt(insertIndex)}
        className="px-2.5 py-1 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 text-emerald-200 border border-emerald-700/60 font-semibold transition"
      >
        ＋ {t('tactics_free_space.add_pros_cons_btn')}
      </button>
      <button
        type="button"
        onClick={() => handleOpenPickerAt('kifu', insertIndex)}
        className="px-2.5 py-1 rounded-lg bg-indigo-600/85 hover:bg-indigo-500 text-white font-semibold shadow transition"
      >
        ＋ {t('tactics_free_space.add_kifu_btn')}
      </button>
      <button
        type="button"
        onClick={() => handleOpenPickerAt('diagram', insertIndex)}
        className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow transition"
      >
        ＋ {t('tactics_free_space.add_diagram_btn')}
      </button>
    </div>
  );

  const renderInsertSlot = (slotIndex: number) => {
    if (!isEditMode) return null;
    const isExpanded = activeInsertIndex === slotIndex;
    if (isExpanded) {
      return (
        <div
          key={`slot-open-${slotIndex}`}
          className="rounded-xl border border-amber-500/40 bg-slate-900/90 px-3 py-2 flex flex-wrap items-center justify-center gap-2"
        >
          {renderActionButtons(slotIndex)}
          <button
            type="button"
            onClick={() => setActiveInsertIndex(null)}
            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-xs transition"
            title={t('common.cancel')}
          >
            ✕
          </button>
        </div>
      );
    }

    return (
      <div
        key={`slot-${slotIndex}`}
        className="group relative flex items-center justify-center py-0.5"
      >
        <div className="absolute inset-x-4 h-px bg-slate-800/80 group-hover:bg-amber-500/40 transition-colors" />
        <button
          type="button"
          onClick={() => setActiveInsertIndex(slotIndex)}
          className="relative z-10 px-2.5 py-0.5 rounded-full bg-slate-900 border border-slate-700/80 hover:border-amber-500/60 text-slate-400 hover:text-amber-300 text-[11px] font-semibold transition shadow-xs"
        >
          ＋ {t('tactics_free_space.insert_here_btn')}
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {blocks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/60 p-5 text-center space-y-3">
          <p className="text-xs text-slate-400">{t('tactics_free_space.empty_hint')}</p>
          {isEditMode && renderActionButtons(0)}
        </div>
      ) : (
        <>
          {renderInsertSlot(0)}
          {blocks.map((block, idx) => {
            const isEditing = isEditMode && editingBlockId === block.id;
            const headerLabel =
              block.type === 'text'
                ? `📄 ${t('tactics_free_space.block_type_text')}`
                : block.type === 'pros_cons'
                  ? `⚖️ ${t('tactics_free_space.block_type_pros_cons')}`
                  : block.type === 'kifu'
                    ? `📖 ${t('tactics_free_space.block_type_kifu')}`
                    : block.type === 'diagram'
                      ? `📐 ${t('tactics_free_space.block_type_diagram')}`
                      : `♟️ ${t('tactics_free_space.block_type_legacy_tactic')}`;

            return (
              <React.Fragment key={block.id}>
                <div className="rounded-xl border border-slate-800 bg-slate-900/85 p-3 space-y-2.5 shadow-sm">
                  {/* Shared Block Header Controls */}
                  <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-800/80 text-[11px]">
                    <span className="font-bold text-slate-400">{headerLabel}</span>
                    {isEditMode && (
                      <div className="flex items-center gap-1">
                        {block.type === 'kifu' && (() => {
                          const mode = block.displayMode ?? 'player';
                          const canSwitchToPlayer =
                            embeddedPlayerCount < MAX_EMBEDDED_KIFU_PLAYERS;
                          return (
                            <button
                              type="button"
                              disabled={mode === 'link' && !canSwitchToPlayer}
                              onClick={() =>
                                onChangeBlocks(
                                  updateNoteBlock(blocks, block.id, (prev) =>
                                    prev.type === 'kifu'
                                      ? {
                                          ...prev,
                                          displayMode:
                                            (prev.displayMode ?? 'player') === 'player'
                                              ? 'link'
                                              : 'player',
                                        }
                                      : prev
                                  )
                                )
                              }
                              title={
                                mode === 'link' && !canSwitchToPlayer
                                  ? t('tactics_free_space.player_limit_hint', {
                                      max: MAX_EMBEDDED_KIFU_PLAYERS,
                                    })
                                  : undefined
                              }
                              className="px-2 py-0.5 rounded bg-indigo-950/80 hover:bg-indigo-900 disabled:opacity-40 text-indigo-200 border border-indigo-700/60 text-[10px] font-bold transition"
                            >
                              {mode === 'player'
                                ? `🔗 ${t('tactics_free_space.mode_link')}`
                                : `♟️ ${t('tactics_free_space.mode_player')}`}
                            </button>
                          );
                        })()}
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() =>
                            onChangeBlocks(moveNoteBlock(blocks, block.id, 'up'))
                          }
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-35 text-slate-300 transition"
                          title={t('tactics_free_space.move_up')}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={idx === blocks.length - 1}
                          onClick={() =>
                            onChangeBlocks(moveNoteBlock(blocks, block.id, 'down'))
                          }
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-35 text-slate-300 transition"
                          title={t('tactics_free_space.move_down')}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            isEditing ? setEditingBlockId(null) : startEditingBlock(block)
                          }
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
                          title={t('common.edit')}
                        >
                          {isEditing ? t('common.cancel') : '✏️'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onChangeBlocks(removeNoteBlock(blocks, block.id))
                          }
                          className="px-2 py-0.5 rounded bg-rose-950/60 hover:bg-rose-900 text-rose-300 transition"
                          title={t('position_editor.action_delete')}
                        >
                          🗑️
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Block Body */}
                  {block.type === 'text' && (
                    isEditing ? (
                      <div className="space-y-2 text-xs">
                        <input
                          type="text"
                          value={draftTitle}
                          onChange={(e) => setDraftTitle(e.target.value)}
                          placeholder={t('tactics_free_space.text_heading_placeholder')}
                          className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                        <textarea
                          rows={4}
                          value={draftText}
                          onChange={(e) => setDraftText(e.target.value)}
                          placeholder={t('tactics_free_space.text_content_placeholder')}
                          className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingBlockId(null)}
                            className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                          >
                            {t('common.cancel')}
                          </button>
                          <button
                            type="button"
                            onClick={() => saveEditingBlock(block)}
                            className="px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold"
                          >
                            {t('common.save')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1 text-xs">
                        {block.title && (
                          <h3 className="font-bold text-slate-100 text-sm">
                            {block.title}
                          </h3>
                        )}
                        {block.content.trim() ? (
                          <p className="text-slate-300 whitespace-pre-wrap leading-relaxed">
                            {block.content}
                          </p>
                        ) : (
                          <p className="text-slate-500 italic">
                            {t('tactics_free_space.empty_text_block')}
                          </p>
                        )}
                      </div>
                    )
                  )}

                  {block.type === 'pros_cons' && (
                    isEditing ? (
                      <div className="space-y-2.5 text-xs">
                        <input
                          type="text"
                          value={draftTitle}
                          onChange={(e) => setDraftTitle(e.target.value)}
                          placeholder={t('tactics_free_space.pros_cons_title_placeholder')}
                          className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div className="space-y-1">
                            <label className="block font-bold text-emerald-400">
                              {t('tactics.pros')}
                            </label>
                            <textarea
                              rows={3}
                              value={draftPros}
                              onChange={(e) => setDraftPros(e.target.value)}
                              placeholder={t('tactics.pros_placeholder')}
                              className="w-full rounded-lg bg-slate-950 border border-emerald-700/50 px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="block font-bold text-rose-400">
                              {t('tactics.cons')}
                            </label>
                            <textarea
                              rows={3}
                              value={draftCons}
                              onChange={(e) => setDraftCons(e.target.value)}
                              placeholder={t('tactics.cons_placeholder')}
                              className="w-full rounded-lg bg-slate-950 border border-rose-700/50 px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-rose-500"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingBlockId(null)}
                            className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                          >
                            {t('common.cancel')}
                          </button>
                          <button
                            type="button"
                            onClick={() => saveEditingBlock(block)}
                            className="px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold"
                          >
                            {t('common.save')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2 text-xs">
                        {block.title && (
                          <h3 className="font-bold text-slate-100 text-sm">
                            {block.title}
                          </h3>
                        )}
                        {!block.pros && !block.cons ? (
                          <p className="text-slate-500 italic">
                            {t('tactics_free_space.empty_pros_cons_block')}
                          </p>
                        ) : (
                          <div
                            className={`grid grid-cols-1 ${
                              block.pros && block.cons ? 'sm:grid-cols-2' : ''
                            } gap-2.5`}
                          >
                            {block.pros && (
                              <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/25 p-2.5 space-y-1">
                                <div className="text-[11px] font-bold text-emerald-400">
                                  {t('tactics.pros')}
                                </div>
                                <p className="text-slate-200 whitespace-pre-wrap leading-relaxed">
                                  {block.pros}
                                </p>
                              </div>
                            )}
                            {block.cons && (
                              <div className="rounded-lg border border-rose-500/30 bg-rose-950/25 p-2.5 space-y-1">
                                <div className="text-[11px] font-bold text-rose-400">
                                  {t('tactics.cons')}
                                </div>
                                <p className="text-slate-200 whitespace-pre-wrap leading-relaxed">
                                  {block.cons}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  )}

                  {block.type === 'kifu' && (() => {
                    const rec = recordMap.get(block.kifuId);
                    const adaptedPlayerItem = playerItemMap.get(block.kifuId);
                    const displayMode = block.displayMode ?? 'player';
                    return (
                      <div className="space-y-3 text-xs">
                        {rec ? (
                          <>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  {renderKindBadge(resolveGameKind(rec))}
                                  <span className="font-bold text-slate-100 text-sm truncate">
                                    {rec.title}
                                  </span>
                                  <span className="text-[11px] font-mono text-slate-400">
                                    {t('studio_kifu_save.plies_fmt', {
                                      count: rec.totalPlies ?? 0,
                                    })}
                                  </span>
                                </div>
                                {rec.tags.length > 0 && (
                                  <div className="text-[11px] text-slate-400">
                                    {rec.tags.map((tg) => `#${tg}`).join(' ')}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 text-[11px] font-bold">
                                <button
                                  type="button"
                                  onClick={() =>
                                    navigate(`/studio?gameId=${encodeURIComponent(rec.id)}`)
                                  }
                                  className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white shadow transition"
                                >
                                  🔬 {t('tactics.open_in_studio')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    navigate(
                                      `/studio?editPosition=1&gameId=${encodeURIComponent(rec.id)}`
                                    )
                                  }
                                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                                >
                                  🛠️ {t('library_page.action_edit_position')}
                                </button>
                              </div>
                            </div>

                            {displayMode === 'player' && adaptedPlayerItem && (
                              <div className="pt-2 border-t border-slate-800/70">
                                <TacticsDetailPlayer
                                  item={adaptedPlayerItem}
                                  onOpenInStudio={() =>
                                    navigate(`/studio?gameId=${encodeURIComponent(rec.id)}`)
                                  }
                                />
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="rounded-lg bg-rose-950/40 border border-rose-800/50 px-3 py-2 text-rose-200">
                            {t('tactics_free_space.missing_kifu')}
                          </div>
                        )}

                        {isEditing ? (
                          <div className="flex items-center gap-2 pt-1">
                            <input
                              type="text"
                              value={draftText}
                              onChange={(e) => setDraftText(e.target.value)}
                              placeholder={t('tactics_free_space.caption_placeholder')}
                              className="flex-1 rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1 text-slate-100"
                            />
                            <button
                              type="button"
                              onClick={() => saveEditingBlock(block)}
                              className="px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold"
                            >
                              {t('common.save')}
                            </button>
                          </div>
                        ) : block.caption ? (
                          <p className="text-slate-300 whitespace-pre-wrap leading-relaxed border-l-2 border-amber-500/50 pl-2.5">
                            {block.caption}
                          </p>
                        ) : null}
                      </div>
                    );
                  })()}

                  {block.type === 'diagram' && (() => {
                    const diag = diagramMap.get(block.diagramId);
                    return (
                      <div className="space-y-2 text-xs">
                        {diag ? (
                          <div className="flex flex-col sm:flex-row items-start gap-4">
                            <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 overflow-x-auto max-w-full">
                              <FreeBoardDiagramView
                                diagram={diag}
                                cellSizePx={diag.cols > 6 || diag.rows > 6 ? 26 : 36}
                              />
                            </div>
                            <div className="flex-1 min-w-0 space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-500/40 text-[10px] font-mono font-bold">
                                  📐 {diag.cols}×{diag.rows}
                                </span>
                                <span className="font-bold text-slate-100 text-sm">
                                  {diag.title}
                                </span>
                              </div>
                              {diag.description && (
                                <p className="text-slate-400 whitespace-pre-wrap leading-relaxed">
                                  {diag.description}
                                </p>
                              )}
                              {isEditMode && (
                                <div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingDiagram(diag);
                                      setInsertDiagramOnSave(false);
                                      setDiagramModalOpen(true);
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-semibold transition"
                                  >
                                    ✏️ {t('tactics_free_space.edit_diagram_btn')}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-lg bg-rose-950/40 border border-rose-800/50 px-3 py-2 text-rose-200">
                            {t('tactics_free_space.missing_diagram')}
                          </div>
                        )}

                        {isEditing ? (
                          <div className="flex items-center gap-2 pt-1">
                            <input
                              type="text"
                              value={draftText}
                              onChange={(e) => setDraftText(e.target.value)}
                              placeholder={t('tactics_free_space.caption_placeholder')}
                              className="flex-1 rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1 text-slate-100"
                            />
                            <button
                              type="button"
                              onClick={() => saveEditingBlock(block)}
                              className="px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold"
                            >
                              {t('common.save')}
                            </button>
                          </div>
                        ) : block.caption ? (
                          <p className="text-slate-300 whitespace-pre-wrap leading-relaxed border-l-2 border-amber-500/50 pl-2.5">
                            {block.caption}
                          </p>
                        ) : null}
                      </div>
                    );
                  })()}

                  {block.type === 'legacy_tactic' && (
                    <div className="space-y-3 text-xs">
                      <TacticsDetailPlayer
                        item={item}
                        onUpdateComment={onUpdateLegacyComment}
                        onOpenInStudio={onOpenLegacyInStudio}
                      />

                      {isEditing ? (
                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="text"
                            value={draftText}
                            onChange={(e) => setDraftText(e.target.value)}
                            placeholder={t('tactics_free_space.caption_placeholder')}
                            className="flex-1 rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1 text-slate-100"
                          />
                          <button
                            type="button"
                            onClick={() => saveEditingBlock(block)}
                            className="px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold"
                          >
                            {t('common.save')}
                          </button>
                        </div>
                      ) : block.caption ? (
                        <p className="text-slate-300 whitespace-pre-wrap leading-relaxed border-l-2 border-amber-500/50 pl-2.5">
                          {block.caption}
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>

                {renderInsertSlot(idx + 1)}
              </React.Fragment>
            );
          })}
        </>
      )}

      {/* Picker Modal for Inserting Kifu or FreeBoardDiagram */}
      {pickerMode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-4 sm:p-5 shadow-2xl space-y-3 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <h3 className="text-sm font-bold text-slate-100">
                {pickerMode === 'kifu'
                  ? `📖 ${t('tactics_free_space.picker_kifu_title')}`
                  : `📐 ${t('tactics_free_space.picker_diagram_title')}`}
              </h3>
              <button
                type="button"
                onClick={() => setPickerMode(null)}
                className="p-1 text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                placeholder={t('tactics_free_space.picker_search_placeholder')}
                className="flex-1 min-w-[180px] rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              {pickerMode === 'diagram' && (
                <button
                  type="button"
                  onClick={() => {
                    setPickerMode(null);
                    setEditingDiagram(null);
                    setInsertDiagramOnSave(true);
                    setDiagramModalOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow transition"
                >
                  ＋ {t('tactics_free_space.create_and_insert_diagram_btn')}
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {pickerMode === 'kifu' ? (
                filteredPickerRecords.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">
                    {t('tactics_free_space.picker_kifu_empty')}
                  </p>
                ) : (
                  filteredPickerRecords.map((rec) => (
                    <button
                      key={rec.id}
                      type="button"
                      onClick={() => handleInsertKifuBlock(rec.id)}
                      className="w-full text-left p-2.5 rounded-xl border border-slate-800 bg-slate-950/70 hover:bg-slate-800 hover:border-amber-500/50 transition flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-2">
                          {renderKindBadge(resolveGameKind(rec))}
                          <span className="font-bold text-slate-100 truncate">
                            {rec.title}
                          </span>
                        </div>
                        {rec.tags.length > 0 && (
                          <div className="text-[10px] text-slate-400 truncate">
                            {rec.tags.map((tg) => `#${tg}`).join(' ')}
                          </div>
                        )}
                      </div>
                      <span className="text-[11px] font-mono text-slate-400 shrink-0">
                        {t('studio_kifu_save.plies_fmt', {
                          count: rec.totalPlies ?? 0,
                        })}
                      </span>
                    </button>
                  ))
                )
              ) : filteredPickerDiagrams.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">
                  {t('tactics_free_space.picker_diagram_empty')}
                </p>
              ) : (
                filteredPickerDiagrams.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => handleInsertDiagramBlock(d.id)}
                    className="w-full text-left p-2.5 rounded-xl border border-slate-800 bg-slate-950/70 hover:bg-slate-800 hover:border-amber-500/50 transition flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-500/40 text-[10px] font-mono font-bold">
                          📐 {d.cols}×{d.rows}
                        </span>
                        <span className="font-bold text-slate-100 truncate">
                          {d.title}
                        </span>
                      </div>
                      {d.description && (
                        <div className="text-[10px] text-slate-400 truncate">
                          {d.description}
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 shrink-0">
                      {t('diagram_editor.stats_fmt', {
                        pieces: d.pieces.length,
                        marks:
                          d.highlights.length + d.markers.length + d.arrows.length,
                      })}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Embedded Diagram Create / Edit Modal */}
      <FreeBoardDiagramEditorModal
        isOpen={diagramModalOpen}
        initialDiagram={editingDiagram}
        onClose={() => setDiagramModalOpen(false)}
        onSaved={(saved) => {
          setDiagrams(loadFreeBoardDiagrams());
          if (insertDiagramOnSave) {
            handleInsertDiagramBlock(saved.id);
          }
        }}
      />
    </div>
  );
};
