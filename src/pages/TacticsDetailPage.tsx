/**
 * Tactics Detail Page (/tactics/:id).
 * Features:
 * 1. Responsive single-screen layout for desktop and mobile.
 * 2. 3-tier view modes:
 *    - Mode 1 (Minimal): Pure Shogi board only (like Kifu DB, no distractions).
 *    - Mode 2 (AI Lens / Broadcast): Board + Eval gauge + AI candidate arrow + 2-3 plies PV.
 *    - Mode 3 (Full Research): Mode 2 + In-place KIF comments + Move history tree + Studio link.
 * 3. Studio linkage button: launches SingleScreenStudioPage pre-loaded with this tactic.
 * 4. Community Share & Import/Export modal.
 * Follows Rule 1: strictly English code, comments, identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSmartBack } from '../hooks/useSmartBack';
import { TacticsNoteBlock, TacticsNoteItem } from '../types/tacticsNote';
import {
  getTacticsItemById,
  saveTacticsItem,
  updateTacticsMoveComment,
} from '../utils/tacticsStorage';
import { auth } from '../services/firebase';
import { useAuth } from '../hooks/useAuth';
import {
  syncTacticsWithCloud,
  uploadTacticToFirestore,
} from '../services/firestoreKifuSync';
import { createStudioGameFromTactic } from '../utils/tacticsJkfConverter';
import { resolveInitialTacticsBlocks } from '../utils/tacticsNoteBlocks';
import { saveStudioGame } from '../utils/studioKifuStorage';
import { TacticsFreeSpaceSection } from '../components/tactics/TacticsFreeSpaceSection';
import { TacticsShareModal } from '../components/tactics/TacticsShareModal';

export const TacticsDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const handleGoBack = useSmartBack('/tactics');
  const { t } = useTranslation();
  const { user } = useAuth();
  const activeUid = user?.uid ?? auth?.currentUser?.uid;

  const [item, setItem] = useState<TacticsNoteItem | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const initializedIdRef = useRef<string | null>(null);

  // Editable metadata state
  const [editTitle, setEditTitle] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [editPros, setEditPros] = useState('');
  const [editCons, setEditCons] = useState('');

  useEffect(() => {
    if (!id) return;
    const loadLocal = () => {
      const found = getTacticsItemById(id);
      if (found) {
        setItem(found);
        setEditTitle(found.title);
        setEditSummary(found.summary);
        setEditPros(found.pros || '');
        setEditCons(found.cons || '');
        if (initializedIdRef.current !== found.id) {
          initializedIdRef.current = found.id;
          const isBlankNote =
            resolveInitialTacticsBlocks(found).length === 0 &&
            !found.summary.trim() &&
            !found.pros?.trim() &&
            !found.cons?.trim();
          setIsEditMode(isBlankNote);
          setIsEditingMeta(false);
        }
      }
    };
    loadLocal();
    if (activeUid) {
      void syncTacticsWithCloud(activeUid, { mode: 'auto' })
        .then(({ pulled }) => {
          if (pulled > 0) loadLocal();
        })
        .catch(() => {
          // Best-effort sync
        });
    }
  }, [id, activeUid]);

  if (!item) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <h2 className="text-lg font-bold text-slate-300 mb-2">
          {t('tactics.not_found', '指定された定跡ノートが見つかりませんでした')}
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleGoBack}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm transition-colors"
          >
            ← {t('common.back')}
          </button>
          <Link
            to="/"
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm transition-colors"
          >
            🏠 {t('common.home')}
          </Link>
        </div>
      </div>
    );
  }

  const handleUpdateComment = (ply: number, comment: string) => {
    if (!item) return;
    const updated = updateTacticsMoveComment(item.id, ply, comment);
    if (updated) {
      setItem(updated);
      const uid = auth?.currentUser?.uid;
      if (uid) {
        void uploadTacticToFirestore(uid, updated);
      }
    }
  };

  const handleSaveMeta = () => {
    if (!item) return;
    const updated: TacticsNoteItem = {
      ...item,
      title: editTitle.trim() || item.title,
      summary: editSummary.trim(),
      pros: editPros.trim(),
      cons: editCons.trim(),
      isCustom: true,
      updatedAt: new Date().toISOString(),
    };
    saveTacticsItem(updated);
    setItem(updated);
    setIsEditingMeta(false);
    const uid = auth?.currentUser?.uid;
    if (uid) {
      void uploadTacticToFirestore(uid, updated);
    }
  };

  const handleSaveFreeBlocks = (nextBlocks: TacticsNoteBlock[]) => {
    if (!item) return;
    const updated: TacticsNoteItem = {
      ...item,
      freeBlocks: nextBlocks,
      isCustom: true,
      updatedAt: new Date().toISOString(),
    };
    saveTacticsItem(updated);
    setItem(updated);
    const uid = auth?.currentUser?.uid;
    if (uid) {
      void uploadTacticToFirestore(uid, updated);
    }
  };

  const handleOpenInStudio = (tacticItem: TacticsNoteItem) => {
    // Convert tactic note into Studio game record and save to local studio games
    const studioGame = createStudioGameFromTactic(tacticItem);
    saveStudioGame(studioGame);
    // Navigate to studio with target gameId
    navigate(`/studio?gameId=${encodeURIComponent(studioGame.id)}`);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-12">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-3 sm:px-4 py-2.5 sm:py-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleGoBack}
              className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors text-xs font-medium flex items-center gap-1"
              title={t('common.back')}
            >
              ← <span>{t('common.back')}</span>
            </button>
            <Link
              to="/"
              title={t('common.home')}
              aria-label={t('common.home')}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors text-xs"
            >
              🏠
            </Link>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <h1 className="text-sm sm:text-lg font-bold text-amber-300 truncate max-w-full sm:max-w-md">
                {item.title}
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-950/80 text-amber-300 border border-amber-800/80">
                {item.tag}
              </span>
              {item.isCustom && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-800">
                  {t('tactics.custom_badge', 'カスタム')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* View / Edit Lock Toggle */}
          <button
            type="button"
            onClick={() => {
              setIsEditMode((prev) => {
                if (prev) setIsEditingMeta(false);
                return !prev;
              });
            }}
            className={`hidden md:inline-flex px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-colors items-center gap-1 border ${
              isEditMode
                ? 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border-emerald-500/50'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
          >
            <span>{isEditMode ? '✏️' : '🔒'}</span>
            <span>
              {isEditMode
                ? t('tactics.mode_editing')
                : t('tactics.mode_view_locked')}
            </span>
          </button>

          {/* Share Modal Trigger */}
          <button
            onClick={() => setIsShareModalOpen(true)}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors flex items-center gap-1"
            title={t('tactics.share_export_title', '共有・書き出し')}
          >
            <span>🌐</span>
            <span className="hidden sm:inline">{t('tactics.share_btn', '共有')}</span>
          </button>

          {/* Studio Link Button */}
          <button
            onClick={() => handleOpenInStudio(item)}
            className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow"
          >
            <span>🔬</span>
            <span className="hidden sm:inline">{t('tactics.open_in_studio', '検討盤面で開く')}</span>
          </button>
        </div>
      </header>

      {/* Main Content Area: Responsive Compact View */}
      <main className="max-w-6xl w-full mx-auto p-2 sm:p-4 flex flex-col gap-3">
        
        {/* Tactics General Overview Card (Compact & Collapsible) */}
        {(isEditMode ||
          Boolean(
            item.summary.trim() || item.sourceGame || item.pros || item.cons
          )) && (
          <section className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-3 shadow-sm flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs sm:text-sm font-bold text-amber-300 flex items-center gap-1.5">
                <span>📖</span> {t('tactics.overview_title', '定跡・手筋の概要')}
              </h2>
              {isEditMode && (
                <button
                  type="button"
                  onClick={() => setIsEditingMeta((prev) => !prev)}
                  className="text-xs text-slate-400 hover:text-amber-400 transition-colors"
                >
                  {isEditingMeta ? t('common.cancel', 'キャンセル') : t('common.edit', '編集')}
                </button>
              )}
            </div>

            {isEditingMeta && isEditMode ? (
            <div className="flex flex-col gap-2 mt-1">
              <div>
                <label className="text-[11px] text-slate-400">
                  {t('tactics.title_label_short', 'タイトル')}
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-100"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400">
                  {t('tactics.overview_label_short', '概要')}
                </label>
                <textarea
                  rows={2}
                  value={editSummary}
                  onChange={(e) => setEditSummary(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-100 resize-none"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-emerald-400">
                    {t('tactics.pros', '長所')}
                  </label>
                  <input
                    type="text"
                    value={editPros}
                    onChange={(e) => setEditPros(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-rose-400">
                    {t('tactics.cons', '弱点')}
                  </label>
                  <input
                    type="text"
                    value={editCons}
                    onChange={(e) => setEditCons(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-100"
                  />
                </div>
              </div>
              <div className="flex justify-end mt-1">
                <button
                  onClick={handleSaveMeta}
                  className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  {t('common.save', '概要を保存')}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {item.summary.trim() && (
                <p className="text-xs text-slate-300 leading-relaxed">
                  {item.summary}
                </p>
              )}
              {item.sourceGame && (
                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-bold text-amber-300 flex items-center gap-1">
                    <span>🔗</span>元棋譜:
                  </span>
                  {item.sourceGame.gameTitle && (
                    <span className="text-slate-200"><strong>{item.sourceGame.gameTitle}</strong></span>
                  )}
                  <span className="text-amber-300/90 font-mono">
                    {item.sourceGame.startPly}手目 〜 {item.sourceGame.endPly}手目
                  </span>
                  {item.sourceGame.tournament && (
                    <span className="text-slate-400">({item.sourceGame.tournament})</span>
                  )}
                </div>
              )}
              {(item.pros || item.cons) && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 border-t border-slate-800/80 text-[11px]">
                  {item.pros && (
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-emerald-400 shrink-0">
                        {t('tactics.pros', '長所')}:
                      </span>
                      <span className="text-slate-300">{item.pros}</span>
                    </div>
                  )}
                  {item.cons && (
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-rose-400 shrink-0">
                        {t('tactics.cons', '弱点')}:
                      </span>
                      <span className="text-slate-300">{item.cons}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          </section>
        )}

        {/* Unified Inline-Insertable Block Stream (Legacy Tactic Board, Text, Pros/Cons, Library Kifu, Board Diagrams) */}
        <TacticsFreeSpaceSection
          item={item}
          blocks={resolveInitialTacticsBlocks(item)}
          isEditMode={isEditMode}
          onChangeBlocks={handleSaveFreeBlocks}
          onUpdateLegacyComment={handleUpdateComment}
          onOpenLegacyInStudio={handleOpenInStudio}
        />
      </main>

      {/* Share & Import/Export Modal */}
      <TacticsShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        currentItem={item}
        onImportSuccess={() => {
          if (id) {
            const reloaded = getTacticsItemById(id);
            if (reloaded) setItem(reloaded);
          }
        }}
      />
    </div>
  );
};
